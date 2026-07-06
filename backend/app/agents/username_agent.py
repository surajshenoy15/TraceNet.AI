"""Username Variant Agent
Generates plausible handle variants for a seed username so the Public Source
Agent can search across common separator styles (rahul_op99 -> rahul-op99 etc).
"""
import re


def generate_variants(username: str) -> list[str]:
    base = username.lstrip("@")
    variants = {base}

    no_sep = re.sub(r"[._\-]", "", base)
    variants.add(no_sep)

    for sep in ["_", ".", "-"]:
        variants.add(re.sub(r"[._\-]", sep, base))

    # split into alpha / numeric tail (rahulop99 -> rahul + op99)
    m = re.match(r"^([a-zA-Z]+)([._\-]?)([a-zA-Z0-9]*)$", base)
    if m:
        head, _, tail = m.groups()
        if head and tail:
            for sep in ["_", ".", "-", ""]:
                variants.add(f"{head}{sep}{tail}")

    return sorted(v for v in variants if v)
