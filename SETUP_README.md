# TraceNet AI — Updated Build

This build adds expanded Apify scraping actors, a modern cyan scanner UI, and a
richer PDF report (tool icons, charts, confidence gauge, key conclusions).

> Note: `backend/venv` and `frontend/node_modules` are **not** included in this
> zip (they are large and machine/OS-specific). Recreate them with the steps
> below. All your source, config, and the Apify token in `backend/.env` are kept.

## Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate    |  macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Your Apify token and all new actor toggles are already set in `backend/.env`.

## Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## What changed
See `CHANGELOG_APIFY_EXPANDED_GRAPH_REPORT.txt` for the full list. Highlights:
- New public-source Apify actors: Instagram, TikTok, X/Twitter, LinkedIn, Reddit,
  contact-info, and domain WHOIS (all toggleable in `.env`).
- Scanner UI: sweeping cyan scan line, radar sweep, progress bar in Scan Progress.
- PDF report: platform/tool icons, bar + donut charts, confidence gauge, and a
  confidence-ranked "Key Conclusions" section. Direct PDF download is unchanged.

Public-source OSINT only. Human review required.
