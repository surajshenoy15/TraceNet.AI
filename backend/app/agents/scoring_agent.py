"""Confidence Scoring Agent
Aggregates per-signal weights from the Matching Agent into one explainable
cluster confidence score (0-100) with a human-readable label.
"""

def score_match(signals: list[dict]) -> dict:
    total = sum(s["weight"] for s in signals)
    total = max(0, min(100, total))

    if total <= 40:
        label = "Weak lead"
    elif total <= 70:
        label = "Possible connection"
    elif total <= 90:
        label = "Strong investigative lead"
    else:
        label = "High-confidence lead"

    return {
        "score": total,
        "label": label,
        "reasons": [s["detail"] for s in signals],
        "limitation": "Still not final identity confirmation. Requires human verification.",
    }


def score_all(matches: list[dict]) -> list[dict]:
    scored = []
    for m in matches:
        result = score_match(m["signals"])
        scored.append({**result, "profile": m["profile"], "signals": m["signals"]})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


def cluster_confidence(scored_matches: list[dict]) -> int:
    if not scored_matches:
        return 0
    top = [m["score"] for m in scored_matches[:5]]
    return round(sum(top) / len(top))
