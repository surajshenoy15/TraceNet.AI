# TraceNet AI — Live Apify Public OSINT Setup

This build removes `demo_profiles.json` from the analysis pipeline and defaults to **Apify-only live public-source mode**.

## What runs through Apify

1. `ntriqpro/maigret-actor` — username OSINT across public profile sites.
2. `apify/google-search-scraper` — public web search for username/email/phone/public IP/domain mentions.
3. `apify/web-scraper` — scrapes officer-provided public URLs and extracts visible social links, emails, phones, and public IP strings.

## What is blocked

TraceNet does **not** run private account-enumeration checks:

- no Amazon / Flipkart account existence probing
- no Truecaller private lookup
- no WhatsApp contact-sync / private lookup
- no login, signup, OTP, forgot-password, cookie, or private-page probing
- no deceptive IP grabber links

The IP feature is **public IP artifact intelligence only**: it can graph an IP typed as a seed or IP strings visible in public Apify search/scrape results.

## `.env`

```env
APIFY_TOKEN=your_apify_token_here
TRACE_APIFY_ONLY_MODE=true
ENABLE_APIFY_MAIGRET=true
ENABLE_APIFY_PUBLIC_SEARCH=true
ENABLE_APIFY_WEB_SCRAPER=true
ENABLE_APIFY_USERNAME_SEARCH=true
ENABLE_APIFY_IP_DOMAIN_SEARCH=true
APIFY_MAIGRET_ACTOR_ID=ntriqpro/maigret-actor
APIFY_PUBLIC_SEARCH_ACTOR_ID=apify/google-search-scraper
APIFY_WEB_SCRAPER_ACTOR_ID=apify/web-scraper
APIFY_MAIGRET_TOP_SITES=100
APIFY_MAIGRET_SITE_TIMEOUT=8
APIFY_SEARCH_MAX_PAGES=1
APIFY_SEARCH_MAX_RESULTS=10
APIFY_WEB_SCRAPER_MAX_PAGES=3
APIFY_WEB_SCRAPER_MAX_ITEMS=25
APIFY_ACTOR_TIMEOUT_SECONDS=120
APIFY_MAX_TOTAL_CHARGE_USD=0.25
```

## Why your output looked “normal” before

Usually one of these is the reason:

1. `APIFY_TOKEN` is empty or the backend was not restarted after editing `.env`.
2. The old zip/folder is still running.
3. Keyless GitHub/Gravatar connectors were still active and made the results look like local fallback.
4. No public results were returned by the Apify actor for that seed.

This version sets `TRACE_APIFY_ONLY_MODE=true` so only Apify connectors run during analysis. Open **OSINT Integrations** in the frontend and check that these are Active:

- Apify Maigret username OSINT
- Apify public web search scraper
- Apify public URL scraper

## Test seed input

```txt
surajshenoyp@gmail.com surajshenoy github.com/surajshenoy 8.8.8.8 +91 98765 43210 instagram linkedin github twitter telegram
```

Use only owned, consent-based, or legally authorized targets.
