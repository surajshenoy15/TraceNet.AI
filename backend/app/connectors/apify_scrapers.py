"""Additional Apify scraping connectors for TraceNet AI.

These connectors expand public-source coverage beyond the original three
(Maigret / Google Search / Web Scraper). Each one targets a specific public
surface:

  - ApifyInstagramConnector : public Instagram profile + recent public posts
  - ApifyTikTokConnector    : public TikTok profile + recent public videos
  - ApifyTwitterConnector   : public X/Twitter profile + recent public tweets
  - ApifyLinkedInConnector  : public LinkedIn profile summary
  - ApifyRedditConnector    : public Reddit user profile + recent public posts
  - ApifyEmailContactConnector : public contact-info scrape for a domain/URL
  - ApifyDomainWhoisConnector  : public WHOIS record for a domain

Safety boundary (identical to apify_connector.py):
These actors only read PUBLIC profile pages and PUBLIC records. They never run
login, signup, OTP, contact-sync, private account enumeration, or IP grabbers.
If a profile is private, the actor simply returns nothing usable.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from app.config import settings
from app.connectors.base import Connector, ProfileHit
from app.connectors.apify_connector import (
    ApifyClientLite,
    _make_hit,
    _dedupe_hits,
    _collect_strings,
    _walk_dicts,
    _safe_snippet,
    EMAIL_RE,
    PHONE_RE,
    DOMAIN_RE,
)


def _first(item: dict, keys: tuple[str, ...], default: str = "") -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, (str, int, float)) and str(value).strip():
            return str(value).strip()
    return default


def _int(item: dict, keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = item.get(key)
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str) and value.replace(",", "").isdigit():
            return int(value.replace(",", ""))
    return None


def _posts_from_item(item: dict, keys: tuple[str, ...], limit: int) -> list[dict]:
    posts: list[dict] = []
    for key in keys:
        value = item.get(key)
        if isinstance(value, list):
            for entry in value[:limit]:
                if isinstance(entry, dict):
                    text = _first(entry, ("caption", "text", "content", "title", "description"))
                    ts = _first(entry, ("timestamp", "createTime", "createdAt", "created_at", "date", "time"))
                    if text:
                        posts.append({"text": text[:500], "timestamp": ts or None, "hashtags": []})
            if posts:
                break
    return posts


# ---------------------------------------------------------------------------
# Social profile scrapers (username driven)
# ---------------------------------------------------------------------------
class _BaseProfileScraper(Connector):
    requires_key = True
    platform_label = "Social"
    post_keys: tuple[str, ...] = ("latestPosts", "posts")

    def is_configured(self) -> bool:
        return self._enabled() and bool(settings.apify_token.strip())

    def supports(self, entity_type: str) -> bool:
        return entity_type == "username"

    # subclasses override
    def _enabled(self) -> bool:
        return False

    def _actor_id(self) -> str:
        return ""

    def _payload(self, username: str) -> dict:
        return {}

    def _profile_url(self, username: str, item: dict) -> str:
        return ""

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        username = value.strip().lstrip("@")
        if not username:
            return []

        items = ApifyClientLite().run_sync_dataset(
            self._actor_id(),
            self._payload(username),
            max_items=settings.apify_profile_scraper_max_items,
            timeout_seconds=settings.apify_actor_timeout_seconds,
            max_total_charge_usd=settings.apify_max_total_charge_usd,
        )

        hits: list[ProfileHit] = []
        for item in _walk_dicts(items):
            if not isinstance(item, dict):
                continue
            handle = _first(item, ("username", "handle", "userName", "screen_name", "nickname"), username)
            if not handle:
                continue
            url = self._profile_url(handle, item)
            bio = _first(item, ("biography", "bio", "description", "about", "signature", "rawDescription"))
            full_name = _first(item, ("fullName", "name", "displayName", "full_name"))
            followers = _int(item, ("followersCount", "followers", "fans", "followerCount"))
            posts = _posts_from_item(item, self.post_keys, settings.apify_profile_scraper_max_posts)

            extra = {"full_name": full_name, "followers": followers}
            if posts:
                extra["posts"] = posts

            snippet_parts = [full_name, bio]
            if followers is not None:
                snippet_parts.append(f"{followers} followers")
            snippet = " · ".join(p for p in snippet_parts if p)

            hit = _make_hit(
                platform=self.platform_label,
                handle=handle,
                url=url or None,
                bio=bio or f"Public {self.platform_label} profile discovered via Apify.",
                source_type=self.name,
                matched_entity_type="username",
                matched_entity_value="@" + username,
                actor_id=self._actor_id(),
                title=full_name or handle,
                snippet=snippet,
                query=username,
                artifact_type="social_profile",
                extra=extra,
            )
            hit.location = _first(item, ("location", "city", "region", "country"))
            hit.image_hash = _first(item, ("profilePicUrl", "avatar", "profile_image_url", "profilePicture")) or None
            hits.append(hit)

        return _dedupe_hits(hits, settings.apify_profile_scraper_max_items)


class ApifyInstagramConnector(_BaseProfileScraper):
    name = "apify_instagram"
    label = "Apify Instagram public profile scraper"
    provider_url = "https://apify.com/apify/instagram-profile-scraper"
    platform_label = "Instagram"
    post_keys = ("latestPosts", "posts")

    def _enabled(self) -> bool:
        return settings.enable_apify_instagram

    def _actor_id(self) -> str:
        return settings.apify_instagram_actor_id

    def _payload(self, username: str) -> dict:
        return {"usernames": [username], "resultsLimit": settings.apify_profile_scraper_max_posts}

    def _profile_url(self, username: str, item: dict) -> str:
        return _first(item, ("url", "inputUrl")) or f"https://www.instagram.com/{username}/"


class ApifyTikTokConnector(_BaseProfileScraper):
    name = "apify_tiktok"
    label = "Apify TikTok public profile scraper"
    provider_url = "https://apify.com/clockworks/tiktok-profile-scraper"
    platform_label = "TikTok"
    post_keys = ("videos", "posts", "latestVideos")

    def _enabled(self) -> bool:
        return settings.enable_apify_tiktok

    def _actor_id(self) -> str:
        return settings.apify_tiktok_actor_id

    def _payload(self, username: str) -> dict:
        return {
            "profiles": [username],
            "resultsPerPage": settings.apify_profile_scraper_max_posts,
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
        }

    def _profile_url(self, username: str, item: dict) -> str:
        return _first(item, ("url", "profileUrl")) or f"https://www.tiktok.com/@{username}"


class ApifyTwitterConnector(_BaseProfileScraper):
    name = "apify_twitter"
    label = "Apify X/Twitter public profile scraper"
    provider_url = "https://apify.com/apidojo/twitter-user-scraper"
    platform_label = "X (Twitter)"
    post_keys = ("tweets", "latestTweets", "posts")

    def _enabled(self) -> bool:
        return settings.enable_apify_twitter

    def _actor_id(self) -> str:
        return settings.apify_twitter_actor_id

    def _payload(self, username: str) -> dict:
        return {
            "twitterHandles": [username],
            "maxItems": settings.apify_profile_scraper_max_posts,
            "getFollowers": False,
            "getFollowing": False,
        }

    def _profile_url(self, username: str, item: dict) -> str:
        return _first(item, ("url", "twitterUrl")) or f"https://x.com/{username}"


class ApifyRedditConnector(_BaseProfileScraper):
    name = "apify_reddit"
    label = "Apify Reddit public user scraper"
    provider_url = "https://apify.com/trudax/reddit-user-scraper"
    platform_label = "Reddit"
    post_keys = ("posts", "comments", "latestPosts")

    def _enabled(self) -> bool:
        return settings.enable_apify_reddit

    def _actor_id(self) -> str:
        return settings.apify_reddit_actor_id

    def _payload(self, username: str) -> dict:
        return {
            "startUrls": [{"url": f"https://www.reddit.com/user/{username}/"}],
            "maxItems": settings.apify_profile_scraper_max_posts,
            "scrollTimeout": 20,
        }

    def _profile_url(self, username: str, item: dict) -> str:
        return _first(item, ("url", "userUrl")) or f"https://www.reddit.com/user/{username}/"


class ApifyLinkedInConnector(_BaseProfileScraper):
    name = "apify_linkedin"
    label = "Apify LinkedIn public profile scraper"
    provider_url = "https://apify.com/apimaestro/linkedin-profile-detail"
    platform_label = "LinkedIn"
    post_keys = ("posts", "activity")

    def _enabled(self) -> bool:
        return settings.enable_apify_linkedin

    def _actor_id(self) -> str:
        return settings.apify_linkedin_actor_id

    def supports(self, entity_type: str) -> bool:
        # LinkedIn actor works best against a full public profile URL, but we
        # also accept a username and build the canonical /in/ URL.
        return entity_type in ("username", "url")

    def _payload(self, username: str) -> dict:
        return {"username": username, "profileUrls": [f"https://www.linkedin.com/in/{username}/"]}

    def _profile_url(self, username: str, item: dict) -> str:
        return _first(item, ("url", "profileUrl", "linkedinUrl")) or f"https://www.linkedin.com/in/{username}/"

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        if entity_type == "url":
            parsed = urlparse(value if value.startswith("http") else "https://" + value)
            if "linkedin.com" not in parsed.netloc.lower():
                return []
            handle = parsed.path.rstrip("/").split("/")[-1] or value
            return super().query("username", handle)
        return super().query("username", value)


# ---------------------------------------------------------------------------
# Contact-info + WHOIS scrapers (email/domain/url driven)
# ---------------------------------------------------------------------------
class ApifyEmailContactConnector(Connector):
    name = "apify_contact_info"
    label = "Apify public contact-info scraper"
    requires_key = True
    provider_url = "https://apify.com/apify/contact-info-scraper"

    def is_configured(self) -> bool:
        return settings.enable_apify_email_verify and bool(settings.apify_token.strip())

    def supports(self, entity_type: str) -> bool:
        return entity_type in ("email", "domain", "url")

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        cleaned = value.strip()
        if not cleaned:
            return []

        if entity_type == "email":
            domain = cleaned.split("@")[-1]
            target = f"https://{domain}"
        elif entity_type == "domain":
            target = f"https://{cleaned}"
        else:
            target = cleaned if cleaned.startswith("http") else "https://" + cleaned

        payload = {
            "startUrls": [{"url": target}],
            "maxRequestsPerStartUrl": 2,
            "maxDepth": 1,
        }
        items = ApifyClientLite().run_sync_dataset(
            settings.apify_email_verify_actor_id,
            payload,
            max_items=settings.apify_profile_scraper_max_items,
            timeout_seconds=settings.apify_actor_timeout_seconds,
            max_total_charge_usd=settings.apify_max_total_charge_usd,
        )

        hits: list[ProfileHit] = []
        for item in _walk_dicts(items):
            if not isinstance(item, dict):
                continue
            text_blob = " ".join(_collect_strings(item, 60))
            source_url = _first(item, ("url", "domain")) or target

            for email in sorted(set(e.lower() for e in EMAIL_RE.findall(text_blob))):
                hits.append(_make_hit(
                    platform="Email Contact",
                    handle=email,
                    url=source_url,
                    bio="Email published on a public contact/company page.",
                    source_type=self.name,
                    matched_entity_type=entity_type,
                    matched_entity_value=cleaned,
                    actor_id=settings.apify_email_verify_actor_id,
                    title=email,
                    snippet=_safe_snippet(text_blob, 300),
                    query=cleaned,
                    artifact_type="public_email_string",
                    email_pattern=email,
                    extra={"source_url": source_url},
                ))

            for phone in sorted(set(PHONE_RE.findall(text_blob))):
                normalized = "+91" + re.sub(r"\D", "", phone)[-10:]
                hits.append(_make_hit(
                    platform="Phone Contact",
                    handle=normalized,
                    url=source_url,
                    bio="Phone published on a public contact/company page.",
                    source_type=self.name,
                    matched_entity_type=entity_type,
                    matched_entity_value=cleaned,
                    actor_id=settings.apify_email_verify_actor_id,
                    title=normalized,
                    snippet=_safe_snippet(text_blob, 300),
                    query=cleaned,
                    artifact_type="public_phone_string",
                    phone_pattern=normalized,
                    extra={"source_url": source_url},
                ))

        return _dedupe_hits(hits, settings.apify_profile_scraper_max_items)


class ApifyDomainWhoisConnector(Connector):
    name = "apify_domain_whois"
    label = "Apify domain WHOIS scraper"
    requires_key = True
    provider_url = "https://apify.com/epctex/whois-scraper"

    def is_configured(self) -> bool:
        return settings.enable_apify_domain_whois and bool(settings.apify_token.strip())

    def supports(self, entity_type: str) -> bool:
        return entity_type in ("domain", "url", "email")

    def _domain_of(self, entity_type: str, value: str) -> str:
        if entity_type == "email":
            return value.split("@")[-1].strip()
        if entity_type == "url":
            parsed = urlparse(value if value.startswith("http") else "https://" + value)
            return parsed.netloc.replace("www.", "")
        match = DOMAIN_RE.search(value)
        return (match.group(0) if match else value).strip()

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        domain = self._domain_of(entity_type, value)
        if not domain or "." not in domain:
            return []

        payload = {"domains": [domain], "proxy": {"useApifyProxy": True}}
        items = ApifyClientLite().run_sync_dataset(
            settings.apify_domain_whois_actor_id,
            payload,
            max_items=settings.apify_profile_scraper_max_items,
            timeout_seconds=settings.apify_actor_timeout_seconds,
            max_total_charge_usd=settings.apify_max_total_charge_usd,
        )

        hits: list[ProfileHit] = []
        for item in _walk_dicts(items):
            if not isinstance(item, dict):
                continue
            registrar = _first(item, ("registrar", "registrarName", "registrar_name"))
            created = _first(item, ("creationDate", "createdDate", "created", "creation_date"))
            country = _first(item, ("registrantCountry", "country", "registrant_country"))
            org = _first(item, ("registrantOrganization", "org", "organization"))
            if not (registrar or created or org):
                continue

            snippet = " · ".join(p for p in [
                f"Registrar: {registrar}" if registrar else "",
                f"Created: {created}" if created else "",
                f"Org: {org}" if org else "",
                f"Country: {country}" if country else "",
            ] if p)

            hits.append(_make_hit(
                platform="Domain WHOIS",
                handle=domain,
                url=f"https://{domain}",
                bio=snippet or "Public WHOIS record.",
                source_type=self.name,
                matched_entity_type=entity_type,
                matched_entity_value=value,
                actor_id=settings.apify_domain_whois_actor_id,
                title=domain,
                snippet=snippet,
                query=domain,
                artifact_type="public_domain_string",
                extra={"domain": domain, "registrar": registrar, "created": created,
                       "org": org, "country": country, "source_url": f"https://{domain}"},
            ))

        return _dedupe_hits(hits, settings.apify_profile_scraper_max_items)
