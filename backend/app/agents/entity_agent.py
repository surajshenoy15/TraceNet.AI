"""Entity Extraction Agent
Extracts usernames, phones, emails, UPI IDs, URLs, public IPs, and keywords from raw seed text
using deterministic regex. No third-party AI calls - fully explainable.
"""
import re

USERNAME_RE = re.compile(r"(?<![\w.@])@([A-Za-z0-9_.\-]{3,30})")
PHONE_RE = re.compile(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")
IP_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+\-*]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-.]+")
UPI_RE = re.compile(r"\b[a-zA-Z0-9.\-_]{2,256}@(?:upi|ybl|ibl|axl|paytm|okicici|okhdfcbank|oksbi|okaxis)\b", re.I)
URL_RE = re.compile(r"(?:https?://)?(?:www\.)?[a-zA-Z0-9.\-]+\.(?:com|in|org|net|io|co)(?:/[^\s]*)?", re.I)
KEYWORDS = ["refund", "crypto", "trading", "recovery", "upi", "scam", "fraud", "investment"]


def _mask(text: str, start: int, end: int) -> str:
    """Blank out a matched span (keeping length/positions) so a lower-priority
    pattern can't re-match the same characters as a different entity type."""
    return text[:start] + (" " * (end - start)) + text[end:]


def extract_entities(raw_text: str) -> list[dict]:
    found: list[dict] = []
    seen = set()
    working = raw_text  # progressively masked copy; raw_text stays untouched for keywords

    def add(etype: str, value: str, confidence: float = 1.0):
        key = (etype, value.lower())
        if key in seen:
            return
        seen.add(key)
        found.append({"type": etype, "value": value, "confidence": confidence})

    # Priority order matters: UPI and email must be claimed before username/url
    # can mistakenly grab a sub-span like "@gmail.com" out of "r***@gmail.com".
    for m in list(UPI_RE.finditer(working)):
        add("upi", m.group(0))
        working = _mask(working, m.start(), m.end())

    for m in list(EMAIL_RE.finditer(working)):
        add("email", m.group(0))
        working = _mask(working, m.start(), m.end())


    for m in list(IP_RE.finditer(working)):
        # Public-IP artifact only. Ignore private/loopback ranges so this is not
        # treated as a visitor IP grabber or local-network scan.
        value = m.group(0)
        parts = [int(x) for x in value.split(".")]
        is_private = (parts[0] == 10 or parts[0] == 127 or
                      (parts[0] == 172 and 16 <= parts[1] <= 31) or
                      (parts[0] == 192 and parts[1] == 168) or
                      parts[0] >= 224)
        if not is_private:
            add("ip", value, confidence=0.85)
        working = _mask(working, m.start(), m.end())

    for m in list(PHONE_RE.finditer(working)):
        digits = re.sub(r"\D", "", m.group(0))[-10:]
        add("phone", "+91" + digits)
        working = _mask(working, m.start(), m.end())

    for m in list(USERNAME_RE.finditer(working)):
        add("username", "@" + m.group(1))
        working = _mask(working, m.start(), m.end())

    for m in list(URL_RE.finditer(working)):
        add("url", m.group(0))
        working = _mask(working, m.start(), m.end())

    lower = raw_text.lower()
    for kw in KEYWORDS:
        if kw in lower:
            add("keyword", kw, confidence=0.6)

    return found
