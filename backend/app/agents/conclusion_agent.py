"""SOCMINT Conclusion Engine
Reads every signal produced by the pipeline (identity links, image reuse,
interactions, behaviour, content, location, writing style) and produces a
single explainable conclusion for the investigator:

  - primary identity hypothesis (the most-linked handle / real-name candidate)
  - verdict label + an overall correlation score with a transparent breakdown
  - a CID-criteria checklist: which SOCMINT factors were satisfied, with evidence
  - contradictions / gaps the reviewer must resolve
  - clear recommended next action

This is deterministic synthesis (weighted rules), not an LLM. Every line of the
conclusion cites the underlying signal so a reviewer can accept or reject it.
"""
from collections import Counter


# Weight each SOCMINT factor toward the overall correlation verdict.
FACTOR_WEIGHTS = {
    "linked_accounts": 20,      # multiple platforms tied to subject
    "shared_email": 15,         # same email pattern across accounts
    "shared_phone_upi": 10,     # shared phone / UPI identifier
    "image_reuse": 20,          # same profile photo across platforms
    "writing_style": 15,        # high cross-account authorship similarity
    "location": 10,             # converging regional signal
    "behaviour": 5,             # consistent posting chronotype
    "shared_contacts": 5,       # overlapping interaction network
}


def _label(score: int) -> str:
    if score >= 85:
        return "Strong correlation — high-priority lead"
    if score >= 65:
        return "Probable correlation — recommended for reviewer attention"
    if score >= 40:
        return "Possible correlation — needs manual verification"
    return "Weak correlation — low priority"


def build_conclusion(*, scored_matches, entities, regions, behaviour, content,
                     style_cohesion, image_groups, interactions) -> dict:
    factors = []
    score = 0

    # ----- primary identity hypothesis -----
    platforms = [m["profile"] for m in scored_matches]
    handle_counter = Counter()
    for p in platforms:
        base = (p.get("handle") or "").lstrip("@").replace("u/", "").split("-")[0].split(".")[0].split("_")[0]
        if base:
            handle_counter[base] += 1
    primary_alias = handle_counter.most_common(1)[0][0] if handle_counter else "unknown"
    emails = [e["value"] for e in entities if e["type"] == "email"]
    real_name_guess = None
    for p in platforms:
        if p.get("platform") == "LinkedIn" or "tech" in (p.get("handle") or ""):
            real_name_guess = (p.get("handle") or "").replace("-", " ").title()
            break

    # ----- factor: linked accounts -----
    n_accounts = len(platforms)
    if n_accounts >= 2:
        w = FACTOR_WEIGHTS["linked_accounts"] if n_accounts >= 4 else FACTOR_WEIGHTS["linked_accounts"] * n_accounts // 4
        score += w
        factors.append({"factor": "Linked accounts", "satisfied": True, "weight": w,
                        "evidence": f"{n_accounts} accounts correlated across "
                                    f"{len(set(p.get('platform') for p in platforms))} platforms."})
    else:
        factors.append({"factor": "Linked accounts", "satisfied": False, "weight": 0,
                        "evidence": "Fewer than 2 accounts correlated."})

    # ----- factor: shared email -----
    email_patterns = [p.get("email_pattern") for p in platforms if p.get("email_pattern")]
    if email_patterns and len(set(email_patterns)) < len(email_patterns):
        score += FACTOR_WEIGHTS["shared_email"]
        common = Counter(email_patterns).most_common(1)[0][0]
        factors.append({"factor": "Shared email pattern", "satisfied": True,
                        "weight": FACTOR_WEIGHTS["shared_email"],
                        "evidence": f"Email '{common}' reused across multiple accounts."})
    else:
        factors.append({"factor": "Shared email pattern", "satisfied": bool(emails), "weight": 0,
                        "evidence": "No email reuse detected across accounts." if not emails
                                    else "Email present but not shared across accounts."})

    # ----- factor: shared phone / UPI -----
    has_phone = any(e["type"] == "phone" for e in entities)
    has_upi = any(e["type"] == "upi" for e in entities)
    if has_phone or has_upi:
        score += FACTOR_WEIGHTS["shared_phone_upi"]
        factors.append({"factor": "Phone / UPI identifier", "satisfied": True,
                        "weight": FACTOR_WEIGHTS["shared_phone_upi"],
                        "evidence": "Phone and/or UPI identifier tied to the subject cluster."})
    else:
        factors.append({"factor": "Phone / UPI identifier", "satisfied": False, "weight": 0,
                        "evidence": "No phone/UPI identifier in seed inputs."})

    # ----- factor: image reuse -----
    if image_groups:
        biggest = max(g["match_count"] for g in image_groups)
        score += FACTOR_WEIGHTS["image_reuse"]
        factors.append({"factor": "Reused profile photo", "satisfied": True,
                        "weight": FACTOR_WEIGHTS["image_reuse"],
                        "evidence": f"Same profile image found on {biggest} accounts (perceptual-hash match)."})
    else:
        factors.append({"factor": "Reused profile photo", "satisfied": False, "weight": 0,
                        "evidence": "No reused profile image detected."})

    # ----- factor: writing style -----
    cohesion = style_cohesion.get("cohesion", 0) if style_cohesion else 0
    if cohesion >= 0.85:
        score += FACTOR_WEIGHTS["writing_style"]
        factors.append({"factor": "Writing-style match", "satisfied": True,
                        "weight": FACTOR_WEIGHTS["writing_style"],
                        "evidence": f"Cross-account authorship similarity {cohesion} (>=0.85)."})
    else:
        factors.append({"factor": "Writing-style match", "satisfied": False,
                        "weight": 0,
                        "evidence": f"Authorship similarity {cohesion} below 0.85 threshold."})

    # ----- factor: location -----
    if regions:
        top = regions[0]
        if top.get("confidence_pct", 0) >= 50:
            score += FACTOR_WEIGHTS["location"]
            factors.append({"factor": "Converging location", "satisfied": True,
                            "weight": FACTOR_WEIGHTS["location"],
                            "evidence": f"Probable region {top['region']} "
                                        f"({top['confidence_pct']}% of regional signals)."})
        else:
            factors.append({"factor": "Converging location", "satisfied": False, "weight": 0,
                            "evidence": "Regional signals too dispersed for a confident region."})
    else:
        factors.append({"factor": "Converging location", "satisfied": False, "weight": 0,
                        "evidence": "No location signals available."})

    # ----- factor: behaviour -----
    if behaviour and behaviour.get("post_count", 0) >= 3 and behaviour.get("pattern_label") not in (None, "No activity"):
        score += FACTOR_WEIGHTS["behaviour"]
        factors.append({"factor": "Consistent behaviour pattern", "satisfied": True,
                        "weight": FACTOR_WEIGHTS["behaviour"],
                        "evidence": f"'{behaviour['pattern_label']}' chronotype, peak {behaviour['active_window']}, "
                                    f"{behaviour['posts_per_week']} posts/week."})
    else:
        factors.append({"factor": "Consistent behaviour pattern", "satisfied": False, "weight": 0,
                        "evidence": "Insufficient timestamped activity for a behaviour pattern."})

    # ----- factor: shared contacts -----
    shared = (interactions or {}).get("shared_contacts", [])
    if shared:
        score += FACTOR_WEIGHTS["shared_contacts"]
        factors.append({"factor": "Overlapping interaction network", "satisfied": True,
                        "weight": FACTOR_WEIGHTS["shared_contacts"],
                        "evidence": f"{len(shared)} contact(s) shared across multiple subject accounts."})
    else:
        factors.append({"factor": "Overlapping interaction network", "satisfied": False, "weight": 0,
                        "evidence": "No shared contacts across accounts."})

    score = min(100, score)

    # ----- content / nature of activity -----
    kws = [k["term"] for k in (content or {}).get("top_keywords", [])[:6]]
    sentiment = (content or {}).get("sentiment", {}).get("label", "neutral")
    nature = "promotional / financial-solicitation" if any(
        k in kws for k in ("refund", "recovery", "trading", "crypto", "invest")
    ) else "general"

    # ----- contradictions / gaps -----
    gaps = [f["factor"] for f in factors if not f["satisfied"]]

    # ----- recommended action -----
    if score >= 85:
        action = ("Escalate to reviewer for approval and prepare a lawful platform "
                  "preservation/disclosure request. Corroborate with one independent source before action.")
    elif score >= 65:
        action = "Assign for manual verification of the top linked accounts, then route to reviewer."
    elif score >= 40:
        action = "Gather additional seed identifiers (phone, email, image) to strengthen or rule out the correlation."
    else:
        action = "Insufficient correlation. Do not act; collect more public leads or close as inconclusive."

    return {
        "primary_identity": {
            "alias": primary_alias,
            "likely_name": real_name_guess,
            "accounts": [{"handle": p.get("handle"), "platform": p.get("platform"), "url": p.get("url")} for p in platforms],
            "emails": list(set(emails)),
        },
        "verdict": {
            "score": score,
            "label": _label(score),
        },
        "factor_breakdown": factors,
        "content_profile": {
            "nature": nature,
            "sentiment": sentiment,
            "top_keywords": kws,
        },
        "gaps": gaps,
        "recommended_action": action,
        "limitations": [
            "Derived from live public-source/authorized OSINT sources only; not a confirmed identity.",
            "Regional inference is probabilistic, not exact geolocation.",
            "Requires human reviewer approval before any operational or legal step.",
        ],
    }
