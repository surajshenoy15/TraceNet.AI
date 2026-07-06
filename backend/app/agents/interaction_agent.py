"""Interaction Network Agent
Builds the 'who interacts with whom' layer of SOCMINT: frequent contacts,
shared connections across the matched accounts, and the most-engaged users.
Pure counting over publicly visible interaction lists. Deterministic.
"""
from collections import Counter


def build_interaction_network(profiles: list[dict]) -> dict:
    contact_counter = Counter()
    per_account = {}
    contact_to_accounts: dict[str, set] = {}

    for p in profiles:
        handle = p.get("handle")
        contacts = p.get("interactions", []) or []
        per_account[handle] = contacts
        for c in contacts:
            contact_counter[c] += 1
            contact_to_accounts.setdefault(c, set()).add(handle)

    # contacts that appear across 2+ of the subject's accounts = shared network
    shared = [
        {"contact": c, "seen_across": sorted(list(accs)), "account_count": len(accs)}
        for c, accs in contact_to_accounts.items() if len(accs) >= 2
    ]
    shared.sort(key=lambda x: x["account_count"], reverse=True)

    top_contacts = [{"contact": c, "interactions": n} for c, n in contact_counter.most_common(10)]

    # edges for a small interaction graph (subject account -> contact)
    edges = []
    for handle, contacts in per_account.items():
        for c in contacts:
            edges.append({"source": handle, "target": c})

    return {
        "top_contacts": top_contacts,
        "shared_contacts": shared,
        "edges": edges,
        "note": "Frequently engaged users derived from public interaction lists. "
                "Shared contacts across multiple accounts strengthen the same-individual hypothesis.",
    }
