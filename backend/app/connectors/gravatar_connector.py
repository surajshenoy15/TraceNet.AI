"""Gravatar connector — email -> public avatar presence (keyless, legitimate).
Uses the documented md5(email) avatar endpoint. Only reveals whether a public
Gravatar exists for the email; no private data.
"""
import hashlib

import httpx

from app.config import settings
from app.connectors.base import Connector, ProfileHit


class GravatarConnector(Connector):
    name = "gravatar"
    label = "Gravatar (email → public avatar)"
    requires_key = False
    provider_url = "https://gravatar.com"

    def is_configured(self) -> bool:
        return settings.enable_gravatar

    def supports(self, entity_type: str) -> bool:
        return entity_type in ("email",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        email = value.strip().lower()
        if "@" not in email:
            return []
        digest = hashlib.md5(email.encode()).hexdigest()
        url = f"https://www.gravatar.com/avatar/{digest}?d=404"
        try:
            with httpx.Client(timeout=4.0) as client:
                r = client.get(url)
                if r.status_code == 200:
                    return [ProfileHit(
                        platform="Gravatar", handle=email, url=f"https://gravatar.com/{digest}",
                        bio="Public Gravatar avatar exists for this email.",
                        email_pattern=email, image_hash=digest[:8], source_type="gravatar",
                    )]
        except httpx.HTTPError:
            pass
        return []
