"""GitHub connector — public Users API, keyless. Fully legitimate public data."""
import httpx

from app.config import settings
from app.connectors.base import Connector, ProfileHit


class GitHubConnector(Connector):
    name = "github"
    label = "GitHub Users API"
    requires_key = False
    provider_url = "https://api.github.com"

    def supports(self, entity_type: str) -> bool:
        return entity_type in ("username",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        v = value.lstrip("@").strip()
        if not v:
            return []
        try:
            with httpx.Client(timeout=4.0) as client:
                r = client.get(f"{settings.github_api_base}/users/{v}")
                if r.status_code != 200:
                    return []
                d = r.json()
                return [ProfileHit(
                    platform="GitHub", handle=d.get("login"), url=d.get("html_url"),
                    bio=d.get("bio") or "", location=d.get("location") or "",
                    email_pattern=d.get("email"), source_type="github_api",
                )]
        except httpx.HTTPError:
            return []
