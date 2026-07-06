"""Commercial OSINT connectors (mentor-suggested tools).

Each of these talks to a paid / real-person provider and is DISABLED unless the
operator supplies that provider's API key in the environment. This keeps the
default build synthetic and rule-compliant, while giving CID a one-line switch
to activate a lawfully-licensed source.

IMPORTANT: These providers return data about real people. Only enable a key
when you have lawful authority to process that data. TraceNet logs every
connector call in the audit trail.

The request/response shapes below follow each provider's public API docs; if a
provider changes its schema, only the parse_* function needs updating.
"""
import httpx

from app.config import settings
from app.connectors.base import Connector, ProfileHit


class _KeyedConnector(Connector):
    requires_key = True
    key_setting = ""      # attribute name on settings
    endpoint = ""
    accepts: tuple = ()

    def _key(self) -> str:
        return getattr(settings, self.key_setting, "") or ""

    def is_configured(self) -> bool:
        return bool(self._key())

    def supports(self, entity_type: str) -> bool:
        return entity_type in self.accepts

    def _get(self, params: dict) -> dict | None:
        try:
            with httpx.Client(timeout=8.0) as client:
                r = client.get(self.endpoint, params=params,
                               headers={"Authorization": f"Bearer {self._key()}"})
                if r.status_code == 200:
                    return r.json()
        except httpx.HTTPError:
            return None
        return None


class BehindTheEmailConnector(_KeyedConnector):
    name = "behind_the_email"
    label = "Behind the Email (email → public profile signals)"
    provider_url = "https://behindtheemail.com"
    key_setting = "behind_the_email_api_key"
    endpoint = "https://api.behindtheemail.com/v1/lookup"
    accepts = ("email",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        data = self._get({"email": value})
        if not data:
            return []
        hits = []
        for acc in data.get("profiles", []):
            hits.append(ProfileHit(
                platform=acc.get("platform", "web"), handle=acc.get("username") or value,
                url=acc.get("url"), bio=acc.get("headline", ""), location=acc.get("location", ""),
                email_pattern=value, source_type="behind_the_email",
            ))
        return hits


class CheckLeakedPhoneConnector(_KeyedConnector):
    name = "checkleaked_phone"
    label = "CheckLeaked (phone → public/breach references)"
    provider_url = "https://whatsapp.checkleaked.cc"
    key_setting = "checkleaked_api_key"
    endpoint = "https://api.checkleaked.cc/v1/phone"
    accepts = ("phone",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        data = self._get({"number": value})
        if not data:
            return []
        hits = []
        if data.get("whatsapp", {}).get("exists"):
            wa = data["whatsapp"]
            hits.append(ProfileHit(
                platform="WhatsApp", handle=value, url=None,
                bio=wa.get("about", ""), source_type="checkleaked",
                extra={"business": wa.get("business", False)},
            ))
        for ref in data.get("linked_accounts", []):
            hits.append(ProfileHit(
                platform=ref.get("platform", "web"), handle=ref.get("username") or value,
                url=ref.get("url"), source_type="checkleaked",
            ))
        return hits


class IGDetectiveConnector(_KeyedConnector):
    name = "igdetective"
    label = "IGDetective (Instagram activity)"
    provider_url = "https://www.igdetective.com"
    key_setting = "igdetective_api_key"
    endpoint = "https://api.igdetective.com/v1/user"
    accepts = ("username",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        data = self._get({"username": value.lstrip("@")})
        if not data:
            return []
        return [ProfileHit(
            platform="Instagram", handle=value.lstrip("@"),
            url=f"https://instagram.com/{value.lstrip('@')}",
            bio=data.get("bio", ""), location=data.get("location", ""),
            source_type="igdetective",
            extra={"followers": data.get("followers"), "following": data.get("following")},
        )]


class FaceCheckConnector(_KeyedConnector):
    name = "facecheck"
    label = "FaceCheck.ID (reverse image / face search)"
    provider_url = "https://facecheck.id"
    key_setting = "facecheck_api_key"
    endpoint = "https://facecheck.id/api/search"
    accepts = ("image_url",)

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        data = self._get({"image_url": value})
        if not data:
            return []
        hits = []
        for m in data.get("matches", []):
            hits.append(ProfileHit(
                platform=m.get("source", "web"), handle=m.get("title") or "image-match",
                url=m.get("url"), source_type="facecheck",
                extra={"score": m.get("score")},
            ))
        return hits


class OsintIndustriesConnector(_KeyedConnector):
    name = "osint_industries"
    label = "OSINT Industries (email/phone → account discovery)"
    provider_url = "https://app.osint.industries"
    key_setting = "osint_industries_api_key"
    endpoint = "https://api.osint.industries/v2/request"
    accepts = ("email", "phone", "username")

    def query(self, entity_type: str, value: str) -> list[ProfileHit]:
        data = self._get({"type": entity_type, "query": value})
        if not data:
            return []
        hits = []
        for acc in data.get("accounts", data.get("results", [])):
            hits.append(ProfileHit(
                platform=acc.get("module") or acc.get("platform", "web"),
                handle=acc.get("username") or value, url=acc.get("url"),
                bio=acc.get("bio", ""), location=acc.get("location", ""),
                source_type="osint_industries",
            ))
        return hits
