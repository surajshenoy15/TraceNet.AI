# TraceNet AI — Backend (FastAPI + SQLite)

Public-data-only investigative leads. Human review required. No docker, no DB server.

## Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
copy .env.example .env         # Windows  (cp on Mac/Linux)
python -m app.seed             # creates tracenet.db + login users only
uvicorn app.main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

DB is a single file `tracenet.db` created automatically. Delete it to reset.

## Seeded login users (MFA = 123456)

| Email | Password | Role |
|---|---|---|
| rao@agency.gov.in | demo1234 | investigator |
| arjun@agency.gov.in | demo1234 | investigator |
| meera@agency.gov.in | demo1234 | reviewer |
| admin@agency.gov.in | demo1234 | admin |

## Sample case seed input

```
@rahul_op99 rahul.sharma24@gmail.com +91 98765 43210 rahul@upi github.com/rahul-op99 trading refund crypto
```

## Flow

```
POST /auth/login -> POST /auth/verify-mfa -> POST /cases -> POST /cases/{id}/inputs
-> POST /cases/{id}/analyze
-> GET /cases/{id}/{overview|graph|behaviour|content|timeline|map|evidence|audit}
-> POST /cases/{id}/report/generate -> sign -> export PDF
GET /resources -> curated free OSINT links
```

## Boundaries (in code)

- public_source_agent: Apify Maigret + Apify exact public-web search + GitHub/Gravatar + officer-provided public URLs. No demo profile dataset is used.
- regional_agent: region labels only, never coordinates.
- behaviour_agent + content_agent: deterministic (counts, lexicon, stylometry), no LLM.
- every action -> immutable audit_logs row.

## Postman

Import both files in `postman/`.

## Roles (RBAC enforced in API)

| Role | Can do |
|---|---|
| investigator | create cases, add inputs, run analysis, upload evidence, generate report |
| reviewer | view cases, review/verify evidence, approve/reject links, sign & lock reports |
| admin | everything + manage users (/admin) + settings |
| auditor | read-only: view cases, entities, graph, audit log, reports |

Permissions are returned in `/auth/me` and the login response. The frontend hides
controls a role cannot use; the backend independently rejects unauthorized calls
with HTTP 403 (defense in depth).

## SOCMINT Conclusion Engine

`GET /cases/{id}/conclusion` returns the synthesized verdict: primary identity
hypothesis, overall correlation score with a transparent factor breakdown
(linked accounts, shared email, image reuse, writing style, location, behaviour,
shared contacts), content nature, gaps to resolve, and a clear recommended action.
Deterministic weighted rules — no LLM.

## OSINT Connectors (pluggable sources)

TraceNet ships a connector layer so real OSINT providers can be switched on
without touching pipeline code. `GET /connectors` reports status.

| Connector | Source | Auth | Default |
|---|---|---|---|
| github | GitHub Users API | keyless | live |
| gravatar | email → public avatar | keyless | live (ENABLE_GRAVATAR) |
| username_check | public profile-URL existence (Sherlock-lite) | flag | off (ENABLE_LIVE_USERNAME_CHECK) |
| apify_maigret | Apify Maigret username scan | APIFY_TOKEN | on when token exists |
| apify_public_search | Apify Google Search exact public mentions for email/phone | APIFY_TOKEN | on when token exists |

Set `APIFY_TOKEN` in `.env` to activate Apify public-source connectors. Private
account-enumeration/login/contact-sync providers are intentionally not wired into
this build. Every connector call is recorded in the case audit trail. Frontend
status page: **Integrations** tab.


## Apify setup for real public-source data

1. Create/copy `.env` from `.env.example`.
2. Add `APIFY_TOKEN=your_token_here`.
3. For lower-cost hackathon testing keep:

```env
APIFY_MAIGRET_TOP_SITES=100
APIFY_MAIGRET_SITE_TIMEOUT=8
APIFY_MAIGRET_MAX_ITEMS=40
APIFY_SEARCH_MAX_PAGES=1
APIFY_SEARCH_MAX_RESULTS=10
APIFY_MAX_TOTAL_CHARGE_USD=0.25
```

What runs:

- Username seeds run through `ntriqpro/maigret-actor` and return public profile URLs.
- Email and phone seeds run through `apify/google-search-scraper` as exact public-web searches and extract public social/profile URLs from SERP results.
- Amazon/Flipkart/Truecaller/WhatsApp/contact-sync/login/OTP/account-registration checks are intentionally not implemented. The system shows public leads only and keeps every connector call auditable.
