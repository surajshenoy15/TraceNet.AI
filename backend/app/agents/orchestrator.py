from sqlalchemy.orm import Session

from app.audit import log_action
from app.models import Case, CaseInput, Entity, EvidenceItem, GraphNode, GraphEdge, Post
from app.agents import (
    case_scope_agent,
    entity_agent,
    username_agent,
    public_source_agent,
    matching_agent,
    regional_agent,
    scoring_agent,
    graph_agent,
    report_agent,
    behaviour_agent,
    content_agent,
    image_agent,
    interaction_agent,
    conclusion_agent,
)


class ScopeError(Exception):
    pass


def run_pipeline(db: Session, case: Case, user_id: str | None = None) -> dict:
    inputs = db.query(CaseInput).filter(CaseInput.case_id == case.id).all()
    log_action(db, "analysis.started", user_id=user_id, case_id=case.id)

    scope = case_scope_agent.check_scope(case, len(inputs))
    if not scope["passed"]:
        raise ScopeError("; ".join(scope["issues"]))
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="case_scope_agent", details=scope)

    # ---- Entity Extraction ----
    db.query(Entity).filter(Entity.case_id == case.id).delete()
    all_entities: list[dict] = []
    for inp in inputs:
        all_entities += entity_agent.extract_entities(inp.raw_value)

    deduped: dict[tuple, dict] = {}
    for e in all_entities:
        deduped[(e["type"], e["value"].lower())] = e
    all_entities = list(deduped.values())

    for e in all_entities:
        db.add(Entity(case_id=case.id, type=e["type"], value=e["value"], confidence=e["confidence"]))
    db.commit()
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="entity_agent", details={"count": len(all_entities)})

    usernames = [e["value"] for e in all_entities if e["type"] == "username"]
    emails = [e["value"] for e in all_entities if e["type"] == "email"]
    urls = [e["value"] for e in all_entities if e["type"] == "url"]
    phones = [e["value"] for e in all_entities if e["type"] == "phone"]
    keywords = [e["value"] for e in all_entities if e["type"] == "keyword"]
    ips = [e["value"] for e in all_entities if e["type"] == "ip"]

    # ---- Username Variants ----
    variants: list[str] = []
    for u in usernames:
        variants += username_agent.generate_variants(u)
    variants = list(dict.fromkeys(variants)) or usernames
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
                target_type="agent", target_id="username_agent", details={"variants": variants[:20]})

    # ---- Public Source Search ----
    # Live public-source discovery only: no demo_profiles.json fallback.
    # Email-only cases also derive possible usernames from the email local-part
    # and send them to Apify Maigret inside public_source_agent.run().
    derived_email_usernames = public_source_agent.derive_usernames_from_emails(emails)
    candidates = public_source_agent.run(variants, emails, urls, phones, ips) if (variants or derived_email_usernames or emails or phones or urls or ips) else []
    from app.connectors.registry import active_connectors
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="public_source_agent",
               details={"candidates_found": len(candidates),
                        "active_connectors": [c.name for c in active_connectors()]})

    # ---- Profile Matching ----
    seed_username = usernames[0] if usernames else (derived_email_usernames[0] if derived_email_usernames else (variants[0] if variants else ""))
    raw_matches = matching_agent.match_profiles(seed_username, emails, keywords, candidates, seed_phones=phones, seed_ips=ips)

    # ---- Confidence Scoring ----
    scored = scoring_agent.score_all(raw_matches)
    cluster_conf = scoring_agent.cluster_confidence(scored)
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="scoring_agent",
               details={"cluster_confidence": cluster_conf, "matches": len(scored)})

    # ---- Regional Inference ----
    regions = regional_agent.infer_region(raw_matches)
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="regional_agent", details={"regions": regions})

    # ---- Graph Build ----
    db.query(GraphEdge).filter(GraphEdge.case_id == case.id).delete()
    db.query(GraphNode).filter(GraphNode.case_id == case.id).delete()
    graph = graph_agent.build_graph(case.id, all_entities, scored)
    for n in graph["nodes"]:
        db.add(GraphNode(id=n["id"], case_id=case.id, node_type=n["node_type"], label=n["label"], data_json=n["data"]))
    for e in graph["edges"]:
        db.add(GraphEdge(id=e["id"], case_id=case.id, source_node=e["source"], target_node=e["target"],
                          relation=e["relation"], confidence=e["confidence"], reason=e["reason"]))
    db.commit()
    log_action(db, "graph.generated", user_id=user_id, case_id=case.id,
               details={"nodes": len(graph["nodes"]), "edges": len(graph["edges"])})

    # ---- Seed Evidence Items (one per discovered candidate, for the registry) ----
    db.query(EvidenceItem).filter(EvidenceItem.case_id == case.id, EvidenceItem.source != "uploaded").delete()
    for m in scored:
        p = m["profile"]
        db.add(EvidenceItem(
            case_id=case.id,
            type="profile",
            source=p.get("source_type", "public_source"),
            title=f"{p.get('platform')} — {p.get('handle')}",
            file_path=None,
            sha256=None,
            confidence=round(m["score"] / 100, 2),
            verification_status="unreviewed",
            note=p.get("url") or "",
        ))
    db.commit()

    # ---- Behaviour & Content Analysis (over matched-cluster posts) ----
    db.query(Post).filter(Post.case_id == case.id).delete()
    case.matched_profiles_json = [
        {"handle": m["profile"].get("handle"), "platform": m["profile"].get("platform"),
         "url": m["profile"].get("url"), "image_hash": m["profile"].get("image_hash"),
         "source_type": m["profile"].get("source_type"),
         "matched_entity_type": m["profile"].get("matched_entity_type"),
         "matched_entity_value": m["profile"].get("matched_entity_value"),
         "apify_actor": m["profile"].get("apify_actor"),
         "apify_query": m["profile"].get("apify_query"),
         "search_title": m["profile"].get("search_title"),
         "search_snippet": m["profile"].get("search_snippet"),
         "ip_address": m["profile"].get("ip_address"),
         "domain": m["profile"].get("domain"),
         "source_url": m["profile"].get("source_url"),
         "artifact_type": m["profile"].get("artifact_type"),
         "email_pattern": m["profile"].get("email_pattern"),
         "phone_pattern": m["profile"].get("phone_pattern"),
         "reasons": m.get("reasons", []),
         "interactions": m["profile"].get("interactions", [])}
        for m in scored
    ]
    all_posts = []
    profile_texts = []
    from datetime import datetime as _dt
    for m in scored:
        p = m["profile"]
        posts = p.get("posts", []) or []
        texts = []
        for post in posts:
            ts = None
            hour = None
            try:
                ts = _dt.fromisoformat(post.get("timestamp"))
                hour = ts.hour
            except (ValueError, TypeError):
                pass
            # per-post sentiment label via content lexicon
            sent = content_agent.analyze_content([post])["sentiment"]["label"]
            db.add(Post(
                case_id=case.id, platform=p.get("platform"), handle=p.get("handle"),
                text=post.get("text", ""), hashtags_json=post.get("hashtags", []),
                timestamp=ts, hour=hour, sentiment_label=sent,
            ))
            all_posts.append(post)
            texts.append(post.get("text", ""))
        if texts:
            profile_texts.append(texts)
    db.commit()

    behaviour = behaviour_agent.analyze_behaviour(all_posts)
    content = content_agent.analyze_content(all_posts)
    style_cohesion = content_agent.cluster_style_cohesion(profile_texts)
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="behaviour_agent",
               details={"pattern": behaviour["pattern_label"], "window": behaviour["active_window"]})
    log_action(db, "agent.completed", user_id=user_id, case_id=case.id,
               target_type="agent", target_id="content_agent",
               details={"sentiment": content["sentiment"]["label"],
                        "style_cohesion": style_cohesion["cohesion"]})

    # ---- SOCMINT Conclusion Engine (synthesis of all signals) ----
    enriched = case.matched_profiles_json or []
    image_groups = image_agent.find_image_reuse(enriched)
    interactions = interaction_agent.build_interaction_network(enriched)
    conclusion = conclusion_agent.build_conclusion(
        scored_matches=scored, entities=all_entities, regions=regions,
        behaviour=behaviour, content=content, style_cohesion=style_cohesion,
        image_groups=image_groups, interactions=interactions,
    )
    case.conclusion_json = conclusion
    db.commit()
    log_action(db, "conclusion.generated", user_id=user_id, case_id=case.id,
               details={"verdict": conclusion["verdict"]["label"],
                        "score": conclusion["verdict"]["score"]})

    case.status = "under_review"
    db.commit()

    return {
        "entities": all_entities,
        "matches": scored,
        "regions": regions,
        "cluster_confidence": cluster_conf,
        "graph": graph,
        "behaviour": behaviour,
        "content": content,
        "style_cohesion": style_cohesion,
    }
