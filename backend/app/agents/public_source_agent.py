"""Public Source Agent

Live public-source discovery only. This module intentionally does NOT load
``app/data/demo_profiles.json`` or any synthetic profile fixture.

Sources used by the pipeline:
  1. Officer-provided public URLs, stored as corroborating evidence.
  2. Active public OSINT connectors from ``app.connectors.registry``.
  3. Apify Maigret for usernames, including optional username candidates derived
     from email local-parts, e.g. ``first.last@gmail.com`` -> ``first.last``,
     ``firstlast``, ``first_last``.
  4. Apify public web search for username/email/phone/IP/domain values.
  5. Apify Web Scraper for officer-provided public URLs.

Boundary: this agent never performs login, signup, password-reset, OTP,
contact-sync, Truecaller, Amazon, Flipkart, WhatsApp private lookup, or any
private account-enumeration check.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from app.config import settings
from app.agents.username_agent import generate_variants


FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
    "yahoo.com", "ymail.com", "icloud.com", "me.com", "proton.me",
    "protonmail.com", "rediffmail.com", "zoho.com",
}


def _clean_username_candidate(value: str) -> str:
    """Keep only characters commonly accepted in public social handles."""
    value = value.lower().strip().lstrip("@")
    value = value.split("+")[0]  # strip gmail plus-tags / routing tags
    value = re.sub(r"[^a-z0-9._-]", "", value)
    value = value.strip("._-")
    if len(value) < 3 or len(value) > 30:
        return ""
    return value


def derive_usernames_from_emails(emails: list[str], max_per_email: int = 8) -> list[str]:
    """Generate username candidates from the public-looking email local-part.

    This does not prove ownership of any account. It only gives Maigret/public
    search plausible username strings to check against public profile URLs.
    """
    if not settings.enable_email_localpart_username_discovery:
        return []

    candidates: list[str] = []
    for email in emails:
        if "@" not in email:
            continue
        local, domain = email.lower().split("@", 1)
        domain = domain.strip()
        base = _clean_username_candidate(local)
        if not base:
            continue

        # Always try the exact local-part. For common personal email providers,
        # also try separator variants because users frequently reuse handles.
        variants = [base]
        if domain in FREE_EMAIL_DOMAINS:
            variants.extend(generate_variants(base))
            variants.append(re.sub(r"[._-]", "", base))
            variants.append(re.sub(r"[._-]", "_", base))
            variants.append(re.sub(r"[._-]", ".", base))
            variants.append(re.sub(r"[._-]", "-", base))

        for v in variants[: max_per_email * 2]:
            cleaned = _clean_username_candidate(v)
            if cleaned and cleaned not in candidates:
                candidates.append(cleaned)
            if len(candidates) >= max_per_email * max(1, len(emails)):
                break
    return candidates


def search_user_provided_urls(urls: list[str]) -> list[dict]:
    """Treat officer-supplied public URLs as low-confidence corroborating
    evidence without private scraping.
    """
    profiles: list[dict] = []
    for raw_url in urls:
        url = raw_url.strip()
        if not url:
            continue
        normalized = url if url.startswith(("http://", "https://")) else "https://" + url
        host = urlparse(normalized).netloc.replace("www.", "") or "public-url"
        handle = (urlparse(normalized).path.strip("/") or host)[:120]
        profiles.append({
            "platform": host,
            "handle": handle,
            "url": normalized,
            "bio": "Officer-provided public URL. Not scraped for private data.",
            "location": "",
            "email_pattern": None,
            "phone_pattern": None,
            "source_type": "user_provided",
            "matched_entity_type": "url",
            "matched_entity_value": raw_url,
        })
    return profiles


def run(username_variants: list[str], emails: list[str], urls: list[str],
        phones: list[str] | None = None, ips: list[str] | None = None) -> list[dict]:
    """Merge live public-source connector hits. No synthetic demo profiles."""
    from app.connectors.registry import query_all

    username_values: list[str] = []
    for value in username_variants:
        cleaned = _clean_username_candidate(value)
        if cleaned and cleaned not in username_values:
            username_values.append(cleaned)

    # This is the important email -> possible username expansion. It lets an
    # email-only case use Apify Maigret without relying on demo_profiles.json.
    for value in derive_usernames_from_emails(emails):
        if value not in username_values:
            username_values.append(value)

    # Derive bare domains from officer URLs and email addresses so the WHOIS /
    # contact-info Apify actors have clean domain seeds to work with.
    domains: list[str] = []
    for u in urls:
        host = urlparse(u if u.startswith(("http://", "https://")) else "https://" + u).netloc.replace("www.", "")
        if host and "." in host and host not in domains:
            domains.append(host)
    for e in emails:
        if "@" in e:
            dom = e.split("@")[-1].strip().lower()
            if dom and "." in dom and dom not in domains:
                domains.append(dom)

    profiles = search_user_provided_urls(urls)
    connector_hits = query_all({
        "username": username_values,
        "email": [e for e in emails if e],
        "phone": [p for p in (phones or []) if p],
        "url": [u for u in urls if u],
        "ip": [ip for ip in (ips or []) if ip],
        "domain": domains,
    })
    profiles += connector_hits
    return profiles
