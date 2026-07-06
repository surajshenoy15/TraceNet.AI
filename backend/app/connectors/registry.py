"""Connector registry — the pipeline's single entry point to allowed OSINT sources.

TraceNet excludes private account-enumeration / contact-sync / OTP / login-probing
providers. With TRACE_APIFY_ONLY_MODE=true, only Apify connectors are active so
demo graphs clearly show live Apify-backed public-source results.
"""
from app.config import settings
from app.connectors.github_connector import GitHubConnector
from app.connectors.gravatar_connector import GravatarConnector
from app.connectors.username_check_connector import UsernameCheckConnector
from app.connectors.apify_connector import ApifyMaigretConnector, ApifyPublicSearchConnector, ApifyWebScraperConnector
from app.connectors.apify_scrapers import (
    ApifyInstagramConnector,
    ApifyTikTokConnector,
    ApifyTwitterConnector,
    ApifyLinkedInConnector,
    ApifyRedditConnector,
    ApifyEmailContactConnector,
    ApifyDomainWhoisConnector,
)

ALL_CONNECTORS = [
    GitHubConnector(),
    GravatarConnector(),
    UsernameCheckConnector(),
    ApifyMaigretConnector(),
    ApifyPublicSearchConnector(),
    ApifyWebScraperConnector(),
    # Expanded public-source scraping actors
    ApifyInstagramConnector(),
    ApifyTikTokConnector(),
    ApifyTwitterConnector(),
    ApifyLinkedInConnector(),
    ApifyRedditConnector(),
    ApifyEmailContactConnector(),
    ApifyDomainWhoisConnector(),
]


def _allowed_in_current_mode(conn) -> bool:
    if not settings.trace_apify_only_mode:
        return True
    return conn.name.startswith("apify_")


def active_connectors() -> list:
    return [c for c in ALL_CONNECTORS if c.is_configured() and _allowed_in_current_mode(c)]


def connector_status() -> list[dict]:
    active_names = {c.name for c in active_connectors()}
    statuses = []
    for c in ALL_CONNECTORS:
        s = c.status()
        s["active"] = c.name in active_names
        if settings.trace_apify_only_mode and not c.name.startswith("apify_"):
            s["configured"] = False
            s["disabled_reason"] = "TRACE_APIFY_ONLY_MODE=true"
        statuses.append(s)
    return statuses


def query_all(entities: dict[str, list[str]]) -> list[dict]:
    """entities: {"username": [...], "email": [...], "phone": [...], "url": [...], "ip": [...], "domain": [...]}
    Returns merged, de-duplicated public-source profile-hit dicts.
    """
    hits: list[dict] = []
    seen = set()
    for conn in active_connectors():
        for etype, values in entities.items():
            if not conn.supports(etype):
                continue
            for v in values:
                try:
                    for hit in conn.query(etype, v):
                        d = hit.as_dict()
                        key = (d.get("platform"), (d.get("handle") or "").lower(), d.get("url"), d.get("source_type"), d.get("matched_entity_type"), d.get("matched_entity_value"))
                        if key in seen:
                            continue
                        seen.add(key)
                        hits.append(d)
                except Exception as exc:
                    print(f"[TraceNet][Connector] {conn.name} failed for {etype}: {exc}")
                    continue
    return hits
