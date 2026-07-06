"""Graph Builder Agent.
Turns seed entities + Apify-expanded scored matches into a richer graph:
Seed -> identifiers -> Apify Actor -> public result/profile -> extracted artifacts.
"""
import uuid
from urllib.parse import urlparse


def _nid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _node_type_for_profile(profile: dict) -> str:
    artifact = (profile.get("artifact_type") or "").lower()
    platform = (profile.get("platform") or "").lower()
    if "email" in artifact or "email artifact" in platform:
        return "email_artifact"
    if "phone" in artifact or "phone artifact" in platform:
        return "phone_artifact"
    if "ip" in artifact or "ip artifact" in platform or profile.get("ip_address"):
        return "ip_artifact"
    if "domain" in artifact or "domain artifact" in platform or profile.get("domain"):
        return "domain_artifact"
    if artifact in {"public_search_result", "scraped_public_page", "public_ip_search_result", "public_domain_search_result"}:
        return "public_result"
    return "profile"


def _safe_label(value: str, fallback: str = "Lead") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def _domain(url: str | None) -> str:
    if not url:
        return ""
    return urlparse(url).netloc.replace("www.", "")


def build_graph(case_id: str, seed_entities: list[dict], scored_matches: list[dict]) -> dict:
    nodes = []
    edges = []
    node_lookup = {}

    def add_node(key, node_type: str, label: str, data: dict | None = None) -> str:
        if key in node_lookup:
            return node_lookup[key]
        nid = _nid(node_type)
        node_lookup[key] = nid
        nodes.append({"id": nid, "node_type": node_type, "label": _safe_label(label), "data": data or {}})
        return nid

    def add_edge(source: str, target: str, relation: str, confidence: float, reason: str) -> None:
        if not source or not target or source == target:
            return
        edges.append({
            "id": _nid("edge"),
            "source": source,
            "target": target,
            "relation": relation,
            "confidence": max(0.05, min(1.0, float(confidence or 0.35))),
            "reason": reason[:900],
        })

    seed_node_id = add_node(("seed", "root"), "seed", "Seed Identity", {"case_id": case_id})

    # Seed entity nodes.
    for ent in seed_entities:
        key = (ent["type"], str(ent["value"]).lower())
        nid = add_node(key, ent["type"], ent["value"], {"confidence": ent.get("confidence", 1.0), "origin": "seed"})
        add_edge(seed_node_id, nid, "contains", 1.0, "Provided as seed input.")

    # Match and artifact nodes.
    for m in scored_matches:
        profile = m["profile"]
        node_type = _node_type_for_profile(profile)
        label = profile.get("handle") or profile.get("url") or profile.get("platform") or "Apify result"
        if node_type == "profile":
            label = f"{label} ({profile.get('platform')})"
        pid = add_node(
            ("lead", profile.get("source_type"), profile.get("platform"), label, profile.get("url"), profile.get("matched_entity_type"), profile.get("matched_entity_value")),
            node_type,
            label,
            {
                "platform": profile.get("platform"),
                "url": profile.get("url"),
                "domain": profile.get("domain") or _domain(profile.get("url")),
                "source_url": profile.get("source_url"),
                "source_type": profile.get("source_type"),
                "matched_entity_type": profile.get("matched_entity_type"),
                "matched_entity_value": profile.get("matched_entity_value"),
                "search_title": profile.get("search_title"),
                "search_snippet": profile.get("search_snippet"),
                "apify_actor": profile.get("apify_actor"),
                "apify_query": profile.get("apify_query"),
                "apify_live": profile.get("apify_live"),
                "ip_address": profile.get("ip_address"),
                "artifact_type": profile.get("artifact_type"),
                "email_pattern": profile.get("email_pattern"),
                "phone_pattern": profile.get("phone_pattern"),
                "score": m["score"],
                "label_text": m["label"],
                "reasons": m.get("reasons", []),
            },
        )

        conf = round(m["score"] / 100, 2)
        reason = "; ".join(m.get("reasons", [])[:4]) or "Apify public-source dataset item."

        # Link from the exact seed entity that triggered the Apify query when possible.
        match_key = None
        mt = profile.get("matched_entity_type")
        mv = profile.get("matched_entity_value")
        if mt and mv:
            normalized_mv = str(mv).lower().lstrip("@") if mt == "username" else str(mv).lower()
            for ent in seed_entities:
                ent_val = str(ent["value"]).lower().lstrip("@") if ent["type"] == "username" else str(ent["value"]).lower()
                if ent["type"] == mt and ent_val == normalized_mv:
                    match_key = (ent["type"], str(ent["value"]).lower())
                    break
        source_seed = node_lookup.get(match_key) if match_key else seed_node_id
        add_edge(source_seed, pid, "apify_discovered", conf, reason)

        # Link to Apify Actor node, making provenance visible on the graph.
        actor = profile.get("apify_actor")
        if actor:
            aid = add_node(("actor", actor), "apify_actor", actor, {"provider": "Apify", "actor": actor})
            add_edge(aid, pid, "returned_dataset_item", 0.95, f"Returned by Apify Actor: {actor}.")

        # Add source domain node.
        source_domain = profile.get("domain") or _domain(profile.get("url") or profile.get("source_url"))
        if source_domain:
            did = add_node(("domain", source_domain), "domain", source_domain, {"origin": "extracted_from_url"})
            add_edge(pid, did, "hosted_on", 0.75, "Domain parsed from public result URL.")

        # Add artifact child nodes for extracted values, even when they are not final profile nodes.
        if profile.get("email_pattern"):
            eid = add_node(("email_artifact", str(profile["email_pattern"]).lower()), "email_artifact", profile["email_pattern"], {"origin": "apify_extracted"})
            add_edge(pid, eid, "mentions", 0.8, "Email string extracted from public Apify result/page text.")
        if profile.get("phone_pattern"):
            phid = add_node(("phone_artifact", str(profile["phone_pattern"])), "phone_artifact", profile["phone_pattern"], {"origin": "apify_extracted"})
            add_edge(pid, phid, "mentions", 0.8, "Phone string extracted from public Apify result/page text.")
        if profile.get("ip_address"):
            ipid = add_node(("ip_artifact", str(profile["ip_address"])), "ip_artifact", profile["ip_address"], {"origin": "public_string_only"})
            add_edge(pid, ipid, "mentions", 0.75, "Public IP string extracted from public Apify result/page text. Not a visitor IP grabber.")

        if profile.get("location"):
            lid = add_node(("location", profile["location"]), "location", profile["location"], {})
            add_edge(pid, lid, "located_at", 0.6, "Location text in profile/bio/snippet.")

    return {"nodes": nodes, "edges": edges}
