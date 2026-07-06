"""Username existence connector (Sherlock-lite).
Checks whether a username has a PUBLIC profile page on common platforms by
issuing a lightweight HTTP request to the public URL. It reads only the HTTP
status (exists / not) — it does NOT scrape profile contents.

DISABLED BY DEFAULT. Because it queries live sites for a (possibly real)
username, it only runs when ENABLE_LIVE_USERNAME_CHECK=true is set by an
authorized operator. Keeps the default demo synthetic and rule-compliant.
"""
import httpx

from app.config import settings
from app.connectors.base import Connector, ProfileHit

# platform -> (profile url template, http codes that mean "exists")
PLATFORMS = {
    "GitHub": ("https://github.com/{u}", {200}),
    "Reddit": ("https://www.reddit.com/user/{u}", {200}),
    "Instagram": ("https://www.instagram.com/{u}/", {200}),
    "X (Twitter)": ("https://x.com/{u}", {200}),
    "Telegram": ("https://t.me/{u}", {200}),
    "Pinterest": ("https://www.pinterest.com/{u}/", {200}),
}


class UsernameCheckConnector(Connector):
    name = "username_check"
    label = "Public username existence check (Sherlock-lite)"
    requires_key = False
    provider_url = ""

    def is_configured(self) -> bool:
        return settings.enable_live_username_check

    def supports(self, entity_type: str) -> bool:
        return entity_type in ("username",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        u = value.lstrip("@").strip()
        if not u:
            return []
        hits = []
        headers = {"User-Agent": "Mozilla/5.0 (TraceNet OSINT lawful-use)"}
        try:
            with httpx.Client(timeout=4.0, headers=headers, follow_redirects=True) as client:
                for platform, (tpl, ok_codes) in PLATFORMS.items():
                    try:
                        r = client.get(tpl.format(u=u))
                        if r.status_code in ok_codes:
                            hits.append(ProfileHit(
                                platform=platform, handle=u, url=tpl.format(u=u),
                                bio="Public profile page exists (existence check only).",
                                source_type="username_check",
                            ))
                    except httpx.HTTPError:
                        continue
        except httpx.HTTPError:
            pass
        return hits
