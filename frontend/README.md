# TraceNet AI — Frontend (React + Vite + Tailwind v4)

Agentic SOCMINT case-management UI. Matches the provided design screenshots:
dark navy panels, cyan accent, lawful-use guardrails baked into every screen.

## Setup

```bash
cd frontend
npm install
cp .env.example .env     # set VITE_API_URL if backend isn't on localhost:8000
npm run dev
```

App runs at http://localhost:5173 — make sure the backend is running first
(see ../backend/README.md), and that the login users have been seeded.

## Flow

```
/login            -> demo email/password + MFA (code: 123456)
/lawful-use        -> lawful-use acknowledgment, must agree + sign
/dashboard         -> stats, recent cases, audit feed, "New Investigation"
/cases/new         -> 3-step wizard: Case Details -> Seed Inputs -> Review & Launch
/cases/:id/scan     -> agent pipeline progress animation
/cases/:id/overview -> cluster confidence, entities, accounts found
/cases/:id/graph    -> React Flow relationship graph, click node for evidence/reasons
/cases/:id/map      -> regional confidence (never exact location)
/cases/:id/evidence -> evidence registry, upload, verify/reject/exclude
/cases/:id/report   -> generate / sign-and-lock / export PDF
/cases/:id/audit    -> immutable per-case audit trail
/settings           -> ethics controls and public-source boundaries
```

## Build

```bash
npm run build
```

Output in `dist/`.


## Apify-enabled investigation flow

The frontend does not store Apify keys. Add `APIFY_TOKEN` only in the backend `.env` file. When a case is launched, the backend runs username/email/phone public-source connectors and the UI displays:

- extracted seed entities,
- public profile leads from Apify Maigret,
- public exact-match email/phone web mentions from Apify Google Search Scraper,
- graph nodes with source type, match reason, confidence, and report evidence.

Private account-enumeration checks are intentionally blocked.
