# Frontend notes

Apify keys never go in the frontend. The frontend calls the backend only.

Updated UI areas:

- New Case Wizard: clearer email/phone/username input guidance and public-source boundary note.
- Scan Progress: shows Apify public OSINT as part of the source agent.
- Integrations: displays active Apify connectors when backend `.env` has `APIFY_TOKEN`.
- Graph View: shows source type, matched entity type/value, search title/snippet, public URL, and edge reasons.
- Report View: shows connector source and matched seed type for every identity lead.
