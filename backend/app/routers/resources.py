from fastapi import APIRouter, Depends

from app.models import User
from app.security import get_current_user

router = APIRouter(prefix="/resources", tags=["resources"])

# Curated free, public OSINT resources. Reference only — investigators use these
# under lawful authority. TraceNet AI itself queries only public APIs and Apify public-source connectors.
OSINT_RESOURCES = [
    {"name": "OSINT Framework", "url": "https://osintframework.com/",
     "desc": "Directory of OSINT tools grouped by data type (username, email, domain...)."},
    {"name": "IntelTechniques Tools", "url": "https://inteltechniques.com/tools/index.html",
     "desc": "Search tools for social media, usernames, and public records."},
    {"name": "OSINT Industries", "url": "https://app.osint.industries/",
     "desc": "Account discovery across platforms from an email or phone."},
    {"name": "Maltego — SOCMINT guide", "url": "https://www.maltego.com/blog/everything-about-social-media-intelligence-socmint-and-investigations/",
     "desc": "Background reading on social media intelligence and investigations."},
    {"name": "GitHub Users API", "url": "https://api.github.com",
     "desc": "Public, keyless API used live by TraceNet AI for handle lookup."},
    {"name": "The OSINT Rack", "url": "https://osintrack.com/",
     "desc": "Curated, constantly-updated collection of OSINT tools for investigators."},
    {"name": "Behind the Email", "url": "https://behindtheemail.com/",
     "desc": "Email -> public profile / career signals. Integrable via API key (Integrations)."},
    {"name": "CheckLeaked (phone)", "url": "https://whatsapp.checkleaked.cc/",
     "desc": "Phone -> public/breach references. Integrable via API key. Lawful use only."},
    {"name": "FaceCheck.ID", "url": "https://facecheck.id/",
     "desc": "Reverse image / face search. Integrable via API key. Lawful use only."},
    {"name": "FaceSeek", "url": "https://www.faceseek.online/",
     "desc": "Face lookup / reverse image search."},
    {"name": "IGDetective", "url": "https://www.igdetective.com/",
     "desc": "Instagram public activity tracker. Integrable via API key."},
]


@router.get("")
def list_resources(user: User = Depends(get_current_user)):
    return {
        "resources": OSINT_RESOURCES,
        "note": "Use only public/synthetic data. Follow responsible-use rules. "
                "TraceNet AI queries public APIs and Apify public-source connectors only.",
    }
