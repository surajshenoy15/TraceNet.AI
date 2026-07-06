"""Profile Matching Agent
Compares seed entities against candidate public profiles using explainable
signals: handle similarity, exact public-web evidence, phone/email/IP artifacts,
URL scraping provenance, location and keyword overlap.
"""
from rapidfuzz import fuzz


def _digits10(value: str) -> str:
    return "".join(ch for ch in str(value) if ch.isdigit())[-10:]


def match_profiles(seed_username: str, seed_emails: list[str], seed_keywords: list[str],
                    candidates: list[dict], seed_phones: list[str] | None = None,
                    seed_ips: list[str] | None = None) -> list[dict]:
    matches = []
    seed_username_norm = seed_username.lstrip("@").lower()
    seed_emails_norm = [e.lower() for e in seed_emails]
    seed_phones_norm = [_digits10(p) for p in (seed_phones or [])]
    seed_ips_norm = [str(ip).strip() for ip in (seed_ips or [])]

    for c in candidates:
        signals = []
        handle_norm = (c.get("handle") or "").lstrip("@").replace("u/", "").lower()
        source_type = c.get("source_type") or "public_source"
        matched_type = c.get("matched_entity_type")

        sim = fuzz.ratio(seed_username_norm, handle_norm) if seed_username_norm and handle_norm else 0
        if sim >= 60:
            signals.append({
                "signal": "username_similarity",
                "weight": 25 if sim >= 85 else round(25 * sim / 100),
                "detail": f"Handle '{c.get('handle')}' is {sim:.0f}% similar to seed handle.",
            })

        if c.get("email_pattern") and c["email_pattern"].lower() in seed_emails_norm:
            signals.append({
                "signal": "email_pattern_match",
                "weight": 25,
                "detail": f"Email pattern '{c['email_pattern']}' matches seed input.",
            })

        phone_value = c.get("phone_pattern") or c.get("matched_phone")
        if phone_value:
            phone_norm = _digits10(phone_value)
            if phone_norm and phone_norm in seed_phones_norm:
                signals.append({
                    "signal": "phone_public_match",
                    "weight": 20,
                    "detail": "Phone number was observed in an exact public-web result or scraped public page.",
                })

        ip_value = c.get("ip_address")
        if ip_value and str(ip_value).strip() in seed_ips_norm:
            signals.append({
                "signal": "ip_public_artifact_match",
                "weight": 18,
                "detail": "Seed IP address was observed in an Apify public-web result. This is not a visitor IP grabber.",
            })

        if str(source_type).startswith("apify"):
            signals.append({
                "signal": "apify_dataset_item",
                "weight": 8,
                "detail": "Lead came from a live Apify Actor dataset, not the original seed text.",
            })

        if matched_type in ("email", "phone", "username", "ip", "domain", "url"):
            signals.append({
                "signal": "apify_public_search_match",
                "weight": 14 if source_type == "apify_public_search" else 9,
                "detail": f"Apify returned or expanded a public result for {matched_type} query.",
            })

        if source_type in ("apify_web_scraper", "apify_scraped_link", "apify_followup_scrape", "apify_extracted_profile", "apify_extracted_artifact"):
            signals.append({
                "signal": "apify_public_url_scrape",
                "weight": 10,
                "detail": "Lead was extracted by Apify Web Scraper from an officer-provided public URL.",
            })

        bio = (c.get("bio") or "").lower()
        kw_hits = [k for k in seed_keywords if k in bio]
        if kw_hits:
            signals.append({
                "signal": "bio_keyword_overlap",
                "weight": min(10, 4 * len(kw_hits)),
                "detail": f"Bio/snippet shares keywords: {', '.join(kw_hits)}.",
            })

        if c.get("artifact_type"):
            signals.append({
                "signal": "artifact_extracted",
                "weight": 7,
                "detail": f"Extracted artifact type: {c.get('artifact_type')}.",
            })

        if c.get("url"):
            signals.append({
                "signal": "public_url_present",
                "weight": 10 if c.get("source_type") == "user_provided" else 5,
                "detail": "Public URL identified from source.",
            })

        if c.get("location"):
            signals.append({
                "signal": "regional_signal",
                "weight": 5,
                "detail": f"Location text found: {c['location']}.",
            })

        if signals:
            matches.append({"profile": c, "signals": signals})

    return matches
