"""Regional Inference Agent
Infers a PROBABLE REGION ONLY from repeated public text signals (bios, demo
metadata). Never returns coordinates, IP geolocation, or exact addresses.
"""
from collections import Counter


def infer_region(matches: list[dict]) -> list[dict]:
    counter = Counter()
    for m in matches:
        loc = m["profile"].get("location")
        if loc:
            counter[loc.split(",")[0].strip()] += 1

    total = sum(counter.values()) or 1
    ranked = [
        {
            "region": region,
            "signal_count": count,
            "confidence_pct": round(100 * count / total),
        }
        for region, count in counter.most_common()
    ]
    return ranked
