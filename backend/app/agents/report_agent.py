"""Report Agent
Builds a deterministic, template-based investigation report (no paid LLM
calls) so output is reproducible and cites evidence IDs directly.
"""
from datetime import datetime


def build_report(case, entities: list[dict], scored_matches: list[dict],
                  regions: list[dict], evidence_items: list[dict], cluster_conf: int) -> dict:

    top_region = regions[0] if regions else None

    linked = [
        {
            "platform": m["profile"].get("platform"),
            "handle": m["profile"].get("handle"),
            "url": m["profile"].get("url"),
            "source_type": m["profile"].get("source_type"),
            "matched_entity_type": m["profile"].get("matched_entity_type"),
            "matched_entity_value": m["profile"].get("matched_entity_value"),
            "apify_actor": m["profile"].get("apify_actor"),
            "apify_query": m["profile"].get("apify_query"),
            "ip_address": m["profile"].get("ip_address"),
            "score": m["score"],
            "label": m["label"],
            "reasons": m["reasons"],
        }
        for m in scored_matches
    ]

    return {
        "case_reference": case.reference_no,
        "case_title": case.title,
        "jurisdiction": case.jurisdiction,
        "generated_at": datetime.utcnow().isoformat(),
        "executive_summary": (
            f"Our investigation identified a cluster of digital identities and online activities "
            f"linked to the subject across {len(linked)} platform(s). Cluster confidence is {cluster_conf}%. "
            f"Key signals include Apify public-web/URL-scrape evidence, matching email/phone/IP artifacts, "
            f"username similarity, and repeated regional text signals where available."
        ),
        "seed_entities": entities,
        "identity_cluster": linked,
        "location_assessment": (
            f"Probable location is {top_region['region']} with {top_region['confidence_pct']}% confidence "
            f"based on {top_region['signal_count']} independent signal(s)."
            if top_region else "Insufficient signals for regional inference."
        ),
        "evidence_table": [
            {
                "id": e.id, "type": e.type, "source": e.source, "title": e.title,
                "sha256": e.sha256, "confidence": e.confidence, "status": e.verification_status,
            }
            for e in evidence_items
        ],
        "limitations": [
            "All findings are derived from live Apify/public-source/authorized OSINT sources only.",
            "IP artifacts are public strings from seed inputs or public pages/search results; the system does not use deceptive IP grabbers.",
            "Regional inference is probabilistic, not real-time or exact location.",
            "No private account access, KYC data, or breach databases were used.",
            "This report does NOT constitute final identity confirmation.",
        ],
        "recommended_next_steps": [
            "Manual verification of each linked profile by a human reviewer.",
            "Issue a lawful preservation/legal request for any platform data needed.",
            "Cross-check with additional corroborating evidence before action.",
            "Obtain reviewer sign-off prior to closing or escalating the case.",
        ],
    }
