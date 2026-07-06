"""Content & Keyword Analysis Agent
Deterministic content signals over post text. No paid AI, no LLM. Every score
traces back to counts or a fixed lexicon so a reviewer can audit it.

Provides:
  - top_keywords            : frequency-ranked content words (stopwords removed)
  - top_hashtags            : most-used hashtags
  - sentiment               : lexicon score + label (negative/neutral/positive)
  - style fingerprint       : avg word len, punctuation rate, caps rate, ttr...
  - style_similarity()      : pairwise writing-style cohesion across accounts
                              (supports the "same author" conclusion)
"""
import math
import re
from collections import Counter

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "at", "is",
    "are", "was", "were", "be", "with", "my", "your", "you", "i", "me", "we", "us",
    "this", "that", "it", "as", "so", "now", "all", "dm", "dont", "do", "not", "have",
    "has", "out", "up", "if", "no", "yes", "from", "by", "new", "today", "tonight",
}

POSITIVE = {
    "guaranteed", "recovery", "recovered", "help", "proud", "excited", "loving",
    "best", "brilliant", "smart", "future", "win", "great", "good", "happy",
}
NEGATIVE = {
    "scam", "fraud", "loss", "losses", "victims", "careful", "warning", "miss",
    "lost", "fake", "risk", "danger", "stolen",
}

WORD_RE = re.compile(r"[a-zA-Z']+")
PUNCT_RE = re.compile(r"[!?.,;:]")
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")


def _tokens(text: str) -> list[str]:
    return [w.lower() for w in WORD_RE.findall(text)]


def analyze_content(posts: list[dict], bio: str = "") -> dict:
    texts = [p.get("text", "") for p in posts]
    if bio:
        texts.append(bio)
    blob = " ".join(texts)
    words = _tokens(blob)

    kw_counter = Counter(w for w in words if w not in STOPWORDS and len(w) > 2)
    top_keywords = [{"term": t, "count": c} for t, c in kw_counter.most_common(8)]

    hashtags = Counter()
    for p in posts:
        for h in p.get("hashtags", []) or []:
            hashtags[h.lower()] += 1
    top_hashtags = [{"tag": t, "count": c} for t, c in hashtags.most_common(8)]

    pos_hits = sum(1 for w in words if w in POSITIVE)
    neg_hits = sum(1 for w in words if w in NEGATIVE)
    total_polar = pos_hits + neg_hits
    if total_polar == 0:
        sentiment_score, sentiment_label = 0.0, "neutral"
    else:
        sentiment_score = round((pos_hits - neg_hits) / total_polar, 2)
        sentiment_label = (
            "positive" if sentiment_score > 0.2 else
            "negative" if sentiment_score < -0.2 else "neutral"
        )

    return {
        "top_keywords": top_keywords,
        "top_hashtags": top_hashtags,
        "sentiment": {
            "score": sentiment_score,
            "label": sentiment_label,
            "positive_hits": pos_hits,
            "negative_hits": neg_hits,
        },
        "style": style_fingerprint(texts),
    }


def style_fingerprint(texts: list[str]) -> dict:
    """Stylometric features used to compare authorship across accounts."""
    blob = " ".join(texts) or ""
    words = _tokens(blob)
    if not words:
        return {"avg_word_len": 0, "punct_rate": 0, "caps_rate": 0, "ttr": 0, "emoji_rate": 0}

    chars = max(len(blob), 1)
    avg_word_len = round(sum(len(w) for w in words) / len(words), 2)
    punct_rate = round(len(PUNCT_RE.findall(blob)) / chars, 4)
    caps_rate = round(sum(1 for c in blob if c.isupper()) / chars, 4)
    ttr = round(len(set(words)) / len(words), 3)  # type-token ratio (vocab richness)
    emoji_rate = round(len(EMOJI_RE.findall(blob)) / chars, 4)

    return {
        "avg_word_len": avg_word_len,
        "punct_rate": punct_rate,
        "caps_rate": caps_rate,
        "ttr": ttr,
        "emoji_rate": emoji_rate,
    }


def _vec(fp: dict) -> list[float]:
    return [fp["avg_word_len"], fp["punct_rate"] * 100, fp["caps_rate"] * 100,
            fp["ttr"] * 10, fp["emoji_rate"] * 100]


def style_similarity(fp_a: dict, fp_b: dict) -> float:
    """Cosine similarity of two style fingerprints -> 0..1."""
    a, b = _vec(fp_a), _vec(fp_b)
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return round(dot / (na * nb), 2)


def cluster_style_cohesion(profile_texts: list[list[str]]) -> dict:
    """Average pairwise writing-style similarity across the matched accounts.
    High cohesion strengthens the 'one individual behind these accounts' lead."""
    fingerprints = [style_fingerprint(t) for t in profile_texts if t]
    if len(fingerprints) < 2:
        return {"cohesion": 0.0, "pairs": 0, "note": "Need 2+ accounts with text to compare."}

    sims = []
    for i in range(len(fingerprints)):
        for j in range(i + 1, len(fingerprints)):
            sims.append(style_similarity(fingerprints[i], fingerprints[j]))
    avg = round(sum(sims) / len(sims), 2)
    return {"cohesion": avg, "pairs": len(sims),
            "note": "Average cross-account writing-style similarity (1.0 = identical style)."}
