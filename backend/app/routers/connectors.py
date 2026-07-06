from fastapi import APIRouter, Depends

from app.config import settings
from app.connectors.registry import connector_status
from app.models import User
from app.security import get_current_user

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("")
def list_connectors(user: User = Depends(get_current_user)):
    statuses = connector_status()
    return {
        "connectors": statuses,
        "active": [c["name"] for c in statuses if c.get("active")],
        "apify_only_mode": settings.trace_apify_only_mode,
        "note": "TRACE_APIFY_ONLY_MODE is ON by default in this build, so analysis uses Apify Actors only. Core actors: Maigret username OSINT, Google Search Scraper (username/email/phone/IP public mentions), and Web Scraper (officer-provided public URLs). Expanded actors: Instagram, TikTok, X/Twitter, LinkedIn, and Reddit public-profile scrapers, a public contact-info scraper, and a domain WHOIS scraper. All are public-source only. IP handling extracts public IP strings from public sources or seed input only; deceptive IP grabbers, private account enumeration, login, OTP, and contact-sync are blocked.",
    }
