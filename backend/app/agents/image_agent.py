"""Image Reuse Agent
Detects the same profile photo reused across platforms by comparing perceptual
hashes (Hamming distance). Deterministic, explainable. Demo profiles carry a
precomputed `image_hash`; in production this is computed with imagehash/OpenCV
over the actual public profile picture.

Low Hamming distance between two hashes => visually identical image => strong
"same individual" signal.
"""


def _hamming(a: str, b: str) -> int:
    """Hamming distance between two equal-length hex hash strings (bit level)."""
    if not a or not b or len(a) != len(b):
        return 999
    try:
        ia, ib = int(a, 16), int(b, 16)
    except ValueError:
        return 999
    return bin(ia ^ ib).count("1")


def find_image_reuse(profiles: list[dict], threshold: int = 6) -> list[dict]:
    """Returns clusters of profiles sharing the same/near-identical image."""
    hashed = [p for p in profiles if p.get("image_hash")]
    groups = []
    used = set()

    for i, a in enumerate(hashed):
        if a["handle"] in used:
            continue
        cluster = [{"handle": a["handle"], "platform": a.get("platform"), "url": a.get("url"), "distance": 0}]
        used.add(a["handle"])
        for b in hashed[i + 1:]:
            if b["handle"] in used:
                continue
            dist = _hamming(a["image_hash"], b["image_hash"])
            if dist <= threshold:
                cluster.append({"handle": b["handle"], "platform": b.get("platform"),
                                "url": b.get("url"), "distance": dist})
                used.add(b["handle"])
        if len(cluster) > 1:
            groups.append({
                "image_hash": a["image_hash"],
                "members": cluster,
                "match_count": len(cluster),
                "note": "Same/near-identical profile photo reused across these accounts "
                        f"(Hamming distance <= {threshold}).",
            })

    return groups
