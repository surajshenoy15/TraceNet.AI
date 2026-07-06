"""Connector base classes.
Every OSINT source implements the same tiny interface so the pipeline can
iterate over them uniformly. A connector normalizes its provider's response
into the common profile-hit dict used everywhere else in TraceNet.
"""
from dataclasses import dataclass, field


@dataclass
class ProfileHit:
    platform: str
    handle: str
    url: str | None = None
    bio: str = ""
    location: str = ""
    email_pattern: str | None = None
    phone_pattern: str | None = None
    image_hash: str | None = None
    source_type: str = "connector"
    extra: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        d = {
            "platform": self.platform,
            "handle": self.handle,
            "url": self.url,
            "bio": self.bio,
            "location": self.location,
            "email_pattern": self.email_pattern,
            "phone_pattern": self.phone_pattern,
            "image_hash": self.image_hash,
            "source_type": self.source_type,
        }
        d.update(self.extra)
        return d


class Connector:
    """Base connector. Subclasses set name/label and implement query()."""
    name = "base"
    label = "Base connector"
    requires_key = False
    provider_url = ""

    def is_configured(self) -> bool:
        """Return True if the connector can run (key present / flag on)."""
        return True

    def supports(self, entity_type: str) -> bool:
        """Which seed entity types this connector accepts."""
        return False

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        return []

    def status(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "requires_key": self.requires_key,
            "configured": self.is_configured(),
            "provider_url": self.provider_url,
        }
