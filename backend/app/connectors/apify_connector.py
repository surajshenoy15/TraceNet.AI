"""Apify connectors for TraceNet AI.

Live public-source mode:
- Username discovery uses Maigret on Apify.
- Public search uses Apify Google Search Scraper for username/email/phone/IP/domain public-web mentions.
- Public URL scraping uses Apify Web Scraper for officer-provided public pages and top SERP pages.

Safety boundary:
This module never runs login, signup, forgot-password, OTP, contact-sync,
Truecaller private lookup, WhatsApp private lookup, Amazon/Flipkart account checks,
or any deceptive IP grabber. IP handling is limited to public IP strings that are
entered as seeds or visibly present on public pages/search results.
"""
from __future__ import annotations

import ipaddress
import re
from urllib.parse import urljoin, urlparse

import httpx

from app.config import settings
from app.connectors.base import Connector, ProfileHit

SOCIAL_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("GitHub", re.compile(r"github\.com/([A-Za-z0-9_.-]{1,39})(?:[/#?]|$)", re.I)),
    ("Instagram", re.compile(r"instagram\.com/([A-Za-z0-9_.]{1,30})(?:[/#?]|$)", re.I)),
    ("X (Twitter)", re.compile(r"(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})(?:[/#?]|$)", re.I)),
    ("Facebook", re.compile(r"facebook\.com/([A-Za-z0-9_.-]{3,50})(?:[/#?]|$)", re.I)),
    ("LinkedIn", re.compile(r"linkedin\.com/(?:in|company|school)/([A-Za-z0-9_.%-]{3,100})(?:[/#?]|$)", re.I)),
    ("Reddit", re.compile(r"reddit\.com/(?:user|u)/([A-Za-z0-9_-]{3,30})(?:[/#?]|$)", re.I)),
    ("TikTok", re.compile(r"tiktok\.com/@([A-Za-z0-9_.]{2,24})(?:[/#?]|$)", re.I)),
    ("Telegram", re.compile(r"(?:t\.me|telegram\.me)/([A-Za-z0-9_]{5,32})(?:[/#?]|$)", re.I)),
    ("YouTube", re.compile(r"youtube\.com/(?:@|c/|user/|channel/)([A-Za-z0-9_.-]{3,80})(?:[/#?]|$)", re.I)),
    ("Pinterest", re.compile(r"pinterest\.com/([A-Za-z0-9_.-]{3,50})(?:[/#?]|$)", re.I)),
    ("Medium", re.compile(r"medium\.com/@([A-Za-z0-9_.-]{3,50})(?:[/#?]|$)", re.I)),
]

EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+\-*]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-.]+")
PHONE_RE = re.compile(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")
IP_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
DOMAIN_RE = re.compile(r"\b(?:[a-zA-Z0-9-]+\.)+(?:com|in|org|net|io|co|edu|gov|dev|app|ai|me|club|xyz)\b", re.I)
URL_RE = re.compile(r"https?://[^\s)>'\"]+|(?:www\.)?(?:github|instagram|x|twitter|facebook|linkedin|reddit|tiktok|youtube|t\.me|telegram|pinterest|medium)\.[^\s)>'\"]+", re.I)

SKIP_HANDLES = {
    "login", "signup", "accounts", "search", "explore", "hashtag", "p", "reel",
    "status", "share", "intent", "home", "help", "privacy", "terms", "about",
}
SKIP_DOMAINS = {"google.com", "www.google.com", "accounts.google.com", "support.google.com"}


def _actor_path(actor_id: str) -> str:
    return actor_id.strip().replace("/", "~")


def _host(url: str) -> str:
    return urlparse(url).netloc.lower().replace("www.", "") if url else ""


def _valid_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.strip())
        return ip.version == 4 and not (ip.is_private or ip.is_loopback or ip.is_multicast or ip.is_reserved or ip.is_link_local)
    except ValueError:
        return False


def _digits10(value: str) -> str:
    return re.sub(r"\D", "", str(value))[-10:]


class ApifyClientLite:
    def __init__(self) -> None:
        self.token = settings.apify_token.strip()
        self.base_url = settings.apify_api_base.rstrip("/")

    def configured(self) -> bool:
        return bool(self.token)

    def run_sync_dataset(
        self,
        actor_id: str,
        payload: dict,
        *,
        max_items: int | None = None,
        timeout_seconds: int | None = None,
        max_total_charge_usd: float | None = None,
    ) -> list[dict]:
        if not self.configured():
            return []

        params: dict[str, str | int | float] = {"clean": "true", "format": "json"}
        if max_items:
            params["maxItems"] = int(max_items)
            params["limit"] = int(max_items)
        if timeout_seconds:
            params["timeout"] = int(timeout_seconds)
        if max_total_charge_usd is not None:
            params["maxTotalChargeUsd"] = float(max_total_charge_usd)

        url = f"{self.base_url}/v2/actors/{_actor_path(actor_id)}/run-sync-get-dataset-items"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "User-Agent": "TraceNet-AI/3.0 live-apify-expander",
        }

        try:
            with httpx.Client(timeout=(timeout_seconds or settings.apify_http_timeout_seconds) + 20) as client:
                response = client.post(url, json=payload, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, list) else [data]
        except (httpx.HTTPError, ValueError) as exc:
            print(f"[TraceNet][Apify] Actor failed: {actor_id}: {exc}")
            return []


def _walk_dicts(value) -> list[dict]:
    found: list[dict] = []
    if isinstance(value, dict):
        found.append(value)
        for child in value.values():
            found.extend(_walk_dicts(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_walk_dicts(child))
    return found


def _collect_strings(value, limit: int = 80) -> list[str]:
    out: list[str] = []

    def walk(v):
        if len(out) >= limit:
            return
        if isinstance(v, str):
            if v.strip():
                out.append(v.strip())
        elif isinstance(v, dict):
            for child in v.values():
                walk(child)
        elif isinstance(v, list):
            for child in v:
                walk(child)

    walk(value)
    return out


def _candidate_url(item: dict) -> str:
    for key in (
        "url", "profile_url", "profileUrl", "link", "resultUrl", "displayedUrl",
        "linkUrl", "organicUrl", "sourceUrl", "landingPageUrl", "href",
    ):
        value = item.get(key)
        if isinstance(value, str):
            v = value.strip()
            if v.startswith(("http://", "https://")):
                return v
    return ""


def _candidate_platform(item: dict, url: str) -> str:
    for key in ("platform", "site", "site_name", "siteName", "name", "source", "service"):
        value = item.get(key)
        if isinstance(value, str) and value.strip() and not value.startswith("http"):
            return value.strip()[:80]
    host = _host(url)
    return host or "Public Web"


def _extract_social_profile(url: str) -> tuple[str, str] | None:
    if not url:
        return None
    for platform, pattern in SOCIAL_PATTERNS:
        match = pattern.search(url)
        if not match:
            continue
        handle = match.group(1).strip().lstrip("@").rstrip("/")
        if handle.lower() in SKIP_HANDLES:
            return None
        return platform, handle
    return None


def _candidate_handle(item: dict, url: str, fallback_username: str = "") -> str:
    for key in ("username", "handle", "user", "login"):
        value = item.get(key)
        if isinstance(value, str) and value.strip() and not value.startswith("http"):
            return value.strip().lstrip("@")[:120]
    social = _extract_social_profile(url)
    if social:
        return social[1]
    title = item.get("title") or item.get("name") or ""
    if isinstance(title, str) and title.strip():
        return title.strip()[:120]
    parsed = urlparse(url)
    if parsed.netloc:
        return (parsed.netloc + parsed.path).replace("www.", "").strip("/")[:120]
    return fallback_username.lstrip("@")[:120]


def _is_found_item(item: dict) -> bool:
    negative_words = ("not found", "false", "missing", "unavailable", "error")
    positive_words = ("found", "exists", "valid", "ok")
    for key in ("status", "exists", "found", "isFound", "available"):
        value = item.get(key)
        if isinstance(value, bool):
            return bool(value)
        if isinstance(value, str):
            low = value.lower()
            if any(w in low for w in positive_words) and not any(w in low for w in negative_words):
                return True
            if any(w in low for w in negative_words):
                return False
    return bool(_candidate_url(item))


def _serp_result_dicts(item: dict) -> list[dict]:
    result_sets: list[dict] = []
    for key in (
        "organicResults", "organic_results", "organic", "results", "items",
        "searchResults", "search_results", "serpResults", "serp_results",
        "paidResults", "suggestedResults", "peopleAlsoAsk",
    ):
        value = item.get(key)
        if isinstance(value, list):
            result_sets.extend([x for x in value if isinstance(x, dict)])
    if not result_sets and _candidate_url(item):
        result_sets.append(item)
    return result_sets


def _urls_from_text(text: str) -> list[str]:
    if not text:
        return []
    out: list[str] = []
    for m in URL_RE.finditer(text):
        raw = m.group(0).rstrip(".,;])}")
        url = raw if raw.startswith(("http://", "https://")) else "https://" + raw
        if _host(url) not in SKIP_DOMAINS and url not in out:
            out.append(url)
    return out[:80]


def _safe_snippet(text: str, max_len: int = 800) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()[:max_len]


def _make_hit(
    *,
    platform: str,
    handle: str,
    url: str | None,
    bio: str,
    source_type: str,
    matched_entity_type: str,
    matched_entity_value: str,
    actor_id: str,
    title: str = "",
    snippet: str = "",
    query: str = "",
    artifact_type: str = "",
    email_pattern: str | None = None,
    phone_pattern: str | None = None,
    extra: dict | None = None,
) -> ProfileHit:
    data = {
        "matched_entity_type": matched_entity_type,
        "matched_entity_value": matched_entity_value,
        "apify_actor": actor_id,
        "apify_query": query,
        "search_title": _safe_snippet(title, 300),
        "search_snippet": _safe_snippet(snippet, 900),
        "artifact_type": artifact_type,
        "apify_live": True,
    }
    if email_pattern:
        data["email_pattern"] = email_pattern.lower()
    if phone_pattern:
        data["phone_pattern"] = phone_pattern
    if extra:
        data.update(extra)
    return ProfileHit(
        platform=platform,
        handle=handle,
        url=url,
        bio=_safe_snippet(bio or snippet or title or "Public Apify dataset item."),
        email_pattern=email_pattern,
        phone_pattern=phone_pattern,
        source_type=source_type,
        extra=data,
    )


def _artifact_hits_from_text(
    text: str,
    *,
    source_url: str,
    title: str,
    matched_entity_type: str,
    matched_entity_value: str,
    actor_id: str,
    query: str = "",
) -> list[ProfileHit]:
    hits: list[ProfileHit] = []
    snippet = _safe_snippet(text)

    for social_url in _urls_from_text(text):
        extracted = _extract_social_profile(social_url)
        if extracted:
            platform, handle = extracted
            hits.append(_make_hit(
                platform=platform,
                handle=handle,
                url=social_url,
                bio="Social/profile URL extracted from public Apify text.",
                source_type="apify_extracted_profile",
                matched_entity_type=matched_entity_type,
                matched_entity_value=matched_entity_value,
                actor_id=actor_id,
                title=title,
                snippet=snippet,
                query=query,
                artifact_type="social_profile_url",
                extra={"source_url": source_url},
            ))

    for email in sorted(set(e.lower() for e in EMAIL_RE.findall(text))):
        hits.append(_make_hit(
            platform="Email Artifact",
            handle=email,
            url=source_url,
            bio="Email string visibly present in public Apify result text.",
            source_type="apify_extracted_artifact",
            matched_entity_type=matched_entity_type,
            matched_entity_value=matched_entity_value,
            actor_id=actor_id,
            title=title,
            snippet=snippet,
            query=query,
            artifact_type="public_email_string",
            email_pattern=email,
            extra={"source_url": source_url},
        ))

    for phone in sorted(set(PHONE_RE.findall(text))):
        digits = _digits10(phone)
        if len(digits) != 10:
            continue
        normalized_phone = "+91" + digits
        hits.append(_make_hit(
            platform="Phone Artifact",
            handle=normalized_phone,
            url=source_url,
            bio="Phone string visibly present in public Apify result text.",
            source_type="apify_extracted_artifact",
            matched_entity_type=matched_entity_type,
            matched_entity_value=matched_entity_value,
            actor_id=actor_id,
            title=title,
            snippet=snippet,
            query=query,
            artifact_type="public_phone_string",
            phone_pattern=normalized_phone,
            extra={"source_url": source_url},
        ))

    for ip in sorted(set(IP_RE.findall(text))):
        if _valid_public_ip(ip):
            hits.append(_make_hit(
                platform="IP Artifact",
                handle=ip,
                url=source_url,
                bio="Public IP string visibly present in public Apify result text. Not a visitor IP grabber.",
                source_type="apify_extracted_artifact",
                matched_entity_type=matched_entity_type,
                matched_entity_value=matched_entity_value,
                actor_id=actor_id,
                title=title,
                snippet=snippet,
                query=query,
                artifact_type="public_ip_string",
                extra={"ip_address": ip, "source_url": source_url},
            ))

    for domain in sorted(set(d.lower() for d in DOMAIN_RE.findall(text))):
        if domain in SKIP_DOMAINS or domain.endswith("google.com"):
            continue
        hits.append(_make_hit(
            platform="Domain Artifact",
            handle=domain,
            url=source_url or f"https://{domain}",
            bio="Domain string visibly present in public Apify result text.",
            source_type="apify_extracted_artifact",
            matched_entity_type=matched_entity_type,
            matched_entity_value=matched_entity_value,
            actor_id=actor_id,
            title=title,
            snippet=snippet,
            query=query,
            artifact_type="public_domain_string",
            extra={"domain": domain, "source_url": source_url},
        ))

    return hits


def _dedupe_hits(hits: list[ProfileHit], limit: int | None = None) -> list[ProfileHit]:
    out: list[ProfileHit] = []
    seen = set()
    for hit in hits:
        key = (hit.platform.lower(), hit.handle.lower(), hit.url or "", hit.source_type, hit.extra.get("matched_entity_type"), hit.extra.get("matched_entity_value"))
        if key in seen:
            continue
        seen.add(key)
        out.append(hit)
        if limit and len(out) >= limit:
            break
    return out


class ApifyMaigretConnector(Connector):
    name = "apify_maigret"
    label = "Apify Maigret username OSINT"
    requires_key = True
    provider_url = "https://apify.com/ntriqpro/maigret-actor"

    def is_configured(self) -> bool:
        return settings.enable_apify_maigret and bool(settings.apify_token.strip())

    def supports(self, entity_type: str) -> bool:
        return entity_type == "username"

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        username = value.strip().lstrip("@")
        if not username:
            return []

        payload = {
            "username": username,
            "topSites": settings.apify_maigret_top_sites,
            "timeout": settings.apify_maigret_site_timeout,
            "tags": settings.apify_maigret_tags,
            "excludeTags": settings.apify_maigret_exclude_tags,
            "sites": settings.apify_maigret_sites,
            "noRecursion": settings.apify_maigret_no_recursion,
            "printNotFound": False,
        }
        items = ApifyClientLite().run_sync_dataset(
            settings.apify_maigret_actor_id,
            payload,
            max_items=settings.apify_maigret_max_items,
            timeout_seconds=settings.apify_actor_timeout_seconds,
            max_total_charge_usd=settings.apify_max_total_charge_usd,
        )

        hits: list[ProfileHit] = []
        for item in _walk_dicts(items):
            if not isinstance(item, dict) or not _is_found_item(item):
                continue
            url = _candidate_url(item)
            if not url:
                continue
            platform = _candidate_platform(item, url)
            handle = _candidate_handle(item, url, username)
            if not handle:
                continue
            title = item.get("title") or item.get("name") or platform
            snippet = " ".join(_collect_strings(item, 20))
            hits.append(_make_hit(
                platform=platform,
                handle=handle,
                url=url,
                bio="Public profile discovered by Apify Maigret username scan.",
                source_type="apify_maigret",
                matched_entity_type="username",
                matched_entity_value="@" + username,
                actor_id=settings.apify_maigret_actor_id,
                title=title,
                snippet=snippet,
                query=username,
                artifact_type="maigret_profile",
                extra={"raw_status": item.get("status") or item.get("found") or item.get("exists")},
            ))
        return _dedupe_hits(hits, settings.apify_maigret_max_items)


class ApifyWebScraperConnector(Connector):
    name = "apify_web_scraper"
    label = "Apify public URL scraper"
    requires_key = True
    provider_url = "https://apify.com/apify/web-scraper"

    def is_configured(self) -> bool:
        return settings.enable_apify_web_scraper and bool(settings.apify_token.strip())

    def supports(self, entity_type: str) -> bool:
        return entity_type == "url"

    def _scrape_url(self, raw_url: str, *, matched_entity_type: str = "url", matched_entity_value: str | None = None, source_type: str = "apify_web_scraper") -> list[ProfileHit]:
        normalized = raw_url.strip() if raw_url.strip().startswith(("http://", "https://")) else "https://" + raw_url.strip()
        parsed = urlparse(normalized)
        if not parsed.netloc or _host(normalized) in SKIP_DOMAINS:
            return []

        page_function = r"""
async function pageFunction(context) {
  const { request, $ } = context;
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 30000);
  const links = $('a').map((_, el) => $(el).attr('href')).get().filter(Boolean).slice(0, 400);
  const meta = $('meta').map((_, el) => ({ name: $(el).attr('name') || $(el).attr('property') || '', content: $(el).attr('content') || '' })).get().slice(0, 80);
  return { url: request.url, title, description, visibleText, links, meta };
}
""".strip()
        payload = {
            "startUrls": [{"url": normalized}],
            "maxRequestsPerCrawl": settings.apify_web_scraper_max_pages,
            "maxRequestRetries": 1,
            "pageFunction": page_function,
            "useChrome": False,
            "headless": True,
            "injectJQuery": True,
            "pageLoadTimeoutSecs": 35,
            "pageFunctionTimeoutSecs": 20,
        }
        items = ApifyClientLite().run_sync_dataset(
            settings.apify_web_scraper_actor_id,
            payload,
            max_items=settings.apify_web_scraper_max_items,
            timeout_seconds=settings.apify_actor_timeout_seconds,
            max_total_charge_usd=settings.apify_max_total_charge_usd,
        )

        hits: list[ProfileHit] = []
        matched = matched_entity_value or raw_url
        hits.append(_make_hit(
            platform=parsed.netloc.replace("www.", ""),
            handle=(parsed.path.strip("/") or parsed.netloc.replace("www.", ""))[:120],
            url=normalized,
            bio="Public URL scraped through Apify Web Scraper.",
            source_type=source_type,
            matched_entity_type=matched_entity_type,
            matched_entity_value=matched,
            actor_id=settings.apify_web_scraper_actor_id,
            title=parsed.netloc,
            snippet=normalized,
            query=normalized,
            artifact_type="scraped_public_page",
            extra={"source_url": normalized},
        ))

        for item in items:
            if not isinstance(item, dict):
                continue
            source_url = item.get("url") or normalized
            title = _safe_snippet(item.get("title") or parsed.netloc, 300)
            description = _safe_snippet(item.get("description") or "", 500)
            visible = item.get("visibleText") or item.get("text") or item.get("bodyText") or ""
            links = item.get("links") if isinstance(item.get("links"), list) else []
            meta = item.get("meta") if isinstance(item.get("meta"), list) else []
            link_text = " ".join(urljoin(source_url, str(link)) for link in links[:400])
            meta_text = " ".join(_collect_strings(meta, 80))
            combined = f"{title} {description} {visible} {link_text} {meta_text}"
            hits.extend(_artifact_hits_from_text(
                combined,
                source_url=source_url,
                title=title,
                matched_entity_type=matched_entity_type,
                matched_entity_value=matched,
                actor_id=settings.apify_web_scraper_actor_id,
                query=normalized,
            ))

        return _dedupe_hits(hits, settings.apify_web_scraper_max_items)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        return self._scrape_url(value)


class ApifyPublicSearchConnector(Connector):
    name = "apify_public_search"
    label = "Apify public web search scraper"
    requires_key = True
    provider_url = "https://apify.com/apify/google-search-scraper"

    def is_configured(self) -> bool:
        return settings.enable_apify_public_search and bool(settings.apify_token.strip())

    def supports(self, entity_type: str) -> bool:
        if entity_type == "username":
            return settings.enable_apify_username_search
        if entity_type in ("ip", "domain"):
            return settings.enable_apify_ip_domain_search
        return entity_type in ("email", "phone")

    def _query_text(self, entity_type: str, cleaned: str) -> str:
        if entity_type == "phone":
            digits = _digits10(cleaned)
            return f'"{digits}"' if digits else f'"{cleaned}"'
        if entity_type == "username":
            handle = cleaned.lstrip("@")
            return "\n".join([
                f'"{handle}"',
                f'"{handle}" site:github.com OR site:gitlab.com OR site:medium.com',
                f'"{handle}" site:instagram.com OR site:x.com OR site:twitter.com OR site:reddit.com OR site:t.me',
                f'"{handle}" site:linkedin.com/in OR site:youtube.com OR site:facebook.com',
            ])
        if entity_type in ("ip", "domain"):
            return f'"{cleaned}"'
        return f'"{cleaned}"'

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        cleaned = value.strip()
        if not cleaned:
            return []
        if entity_type == "ip" and not _valid_public_ip(cleaned):
            return []

        query_text = self._query_text(entity_type, cleaned)
        payload = {
            "queries": query_text,
            "maxPagesPerQuery": settings.apify_search_max_pages,
            "resultsPerPage": settings.apify_search_results_per_page,
            "countryCode": settings.apify_search_country_code,
            "languageCode": settings.apify_search_language_code,
            "forceExactMatch": entity_type in ("email", "phone", "ip", "domain"),
            "mobileResults": False,
            "includeUnfilteredResults": True,
            "saveHtml": False,
            "saveHtmlToKeyValueStore": False,
            "includeIcons": False,
            "maximumLeadsEnrichmentRecords": 0,
            "aiOverview": {"scrapeFullAiOverview": False},
            "aiModeSearch": {"enableAiMode": False},
            "geminiSearch": {"enableGemini": False},
            "perplexitySearch": {"enablePerplexity": False, "returnImages": False, "returnRelatedQuestions": False},
            "chatGptSearch": {"enableChatGpt": False},
            "copilotSearch": {"enableCopilot": False},
            "focusOnPaidAds": False,
        }
        items = ApifyClientLite().run_sync_dataset(
            settings.apify_public_search_actor_id,
            payload,
            max_items=settings.apify_search_max_results,
            timeout_seconds=settings.apify_actor_timeout_seconds,
            max_total_charge_usd=settings.apify_max_total_charge_usd,
        )

        hits: list[ProfileHit] = []
        followup_urls: list[str] = []

        for item in items:
            if not isinstance(item, dict):
                continue
            query_term = ""
            if isinstance(item.get("searchQuery"), dict):
                query_term = item["searchQuery"].get("term") or item["searchQuery"].get("url") or ""
            result_dicts = _serp_result_dicts(item)
            if not result_dicts:
                result_dicts = [item]

            for rank, result in enumerate(result_dicts, start=1):
                title = _safe_snippet(result.get("title") or result.get("name") or "Public search result", 300)
                description = _safe_snippet(result.get("description") or result.get("snippet") or result.get("text") or "", 900)
                url = _candidate_url(result)
                result_text = " ".join(_collect_strings(result, 50))
                full_text = f"{title} {description} {url} {result_text}"

                if url and _host(url) not in SKIP_DOMAINS:
                    extracted = _extract_social_profile(url)
                    if extracted:
                        platform, handle = extracted
                        artifact_type = "social_profile_url"
                    elif entity_type == "ip":
                        platform, handle, artifact_type = "IP Public Mention", cleaned, "public_ip_search_result"
                    elif entity_type == "domain":
                        platform, handle, artifact_type = "Domain Public Mention", cleaned, "public_domain_search_result"
                    else:
                        platform = _candidate_platform(result, url)
                        handle = _candidate_handle(result, url, cleaned)
                        artifact_type = "public_search_result"

                    hits.append(_make_hit(
                        platform=platform,
                        handle=handle,
                        url=url,
                        bio=description or title,
                        source_type="apify_public_search",
                        matched_entity_type=entity_type,
                        matched_entity_value=cleaned,
                        actor_id=settings.apify_public_search_actor_id,
                        title=title,
                        snippet=description,
                        query=query_term or query_text,
                        artifact_type=artifact_type,
                        email_pattern=cleaned.lower() if entity_type == "email" else None,
                        phone_pattern=cleaned if entity_type == "phone" else None,
                        extra={"search_rank": rank, "source_url": url},
                    ))
                    if settings.apify_follow_search_result_pages and len(followup_urls) < settings.apify_follow_search_result_limit:
                        if _host(url) not in SKIP_DOMAINS and not _host(url).endswith("google.com"):
                            followup_urls.append(url)

                hits.extend(_artifact_hits_from_text(
                    full_text,
                    source_url=url or f"https://www.google.com/search?q={cleaned}",
                    title=title,
                    matched_entity_type=entity_type,
                    matched_entity_value=cleaned,
                    actor_id=settings.apify_public_search_actor_id,
                    query=query_term or query_text,
                ))

        # Optional expansion: scrape the top public result pages returned by Google Search.
        # This is what makes the graph show data beyond the original seed text.
        if settings.apify_follow_search_result_pages and settings.enable_apify_web_scraper:
            scraper = ApifyWebScraperConnector()
            if scraper.is_configured():
                for url in followup_urls[: settings.apify_follow_search_result_limit]:
                    hits.extend(scraper._scrape_url(
                        url,
                        matched_entity_type=entity_type,
                        matched_entity_value=cleaned,
                        source_type="apify_followup_scrape",
                    ))

        return _dedupe_hits(hits, settings.apify_search_max_results + settings.apify_web_scraper_max_items)
