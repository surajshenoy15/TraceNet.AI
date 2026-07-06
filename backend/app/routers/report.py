import io
from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from sqlalchemy.orm import Session

from app.routers.report_visuals import (
    tool_icon,
    source_bar_chart,
    actor_donut,
    confidence_gauge,
)

from app.audit import log_action
from app.database import get_db
from app.models import Case, Entity, EvidenceItem, GraphNode, GraphEdge, Report, User
from app.security import get_current_user, require

router = APIRouter(prefix="/cases", tags=["report"])


def _pct(value) -> int:
    try:
        v = float(value or 0)
        return round(v if v > 1 else v * 100)
    except Exception:
        return 0


def _assemble_report_data(db: Session, case: Case) -> dict:
    entities = db.query(Entity).filter(Entity.case_id == case.id).all()
    evidence = db.query(EvidenceItem).filter(EvidenceItem.case_id == case.id).all()
    graph_nodes = db.query(GraphNode).filter(GraphNode.case_id == case.id).all()
    edges = db.query(GraphEdge).filter(GraphEdge.case_id == case.id).all()

    profile_nodes = [n for n in graph_nodes if n.node_type in ("profile", "public_result")]
    artifact_nodes = [n for n in graph_nodes if n.node_type in ("email_artifact", "phone_artifact", "ip_artifact", "domain_artifact", "domain")]
    actor_nodes = [n for n in graph_nodes if n.node_type == "apify_actor"]
    loc_nodes = {n.id: n.label for n in graph_nodes if n.node_type == "location"}
    edge_by_target = {e.target_node: e for e in edges}

    linked = []
    for n in sorted(profile_nodes, key=lambda x: x.data_json.get("score", 0), reverse=True):
        edge = edge_by_target.get(n.id)
        linked.append({
            "node_type": n.node_type,
            "platform": n.data_json.get("platform"),
            "handle": n.label,
            "url": n.data_json.get("url"),
            "domain": n.data_json.get("domain"),
            "score": n.data_json.get("score", 0),
            "label": n.data_json.get("label_text", ""),
            "source_type": n.data_json.get("source_type", ""),
            "matched_entity_type": n.data_json.get("matched_entity_type", ""),
            "matched_entity_value": n.data_json.get("matched_entity_value", ""),
            "apify_actor": n.data_json.get("apify_actor", ""),
            "apify_query": n.data_json.get("apify_query", ""),
            "artifact_type": n.data_json.get("artifact_type", ""),
            "search_title": n.data_json.get("search_title", ""),
            "search_snippet": n.data_json.get("search_snippet", ""),
            "reasons": edge.reason.split("; ") if edge else n.data_json.get("reasons", []),
        })

    artifacts = []
    for n in sorted(artifact_nodes, key=lambda x: (x.node_type, x.label.lower())):
        artifacts.append({
            "type": n.node_type,
            "value": n.label,
            "origin": n.data_json.get("origin", "apify_extracted"),
            "domain": n.data_json.get("domain", ""),
        })

    region_counts = {}
    for e in edges:
        if e.relation == "located_at" and e.target_node in loc_nodes:
            region_counts[loc_nodes[e.target_node]] = region_counts.get(loc_nodes[e.target_node], 0) + 1
    total_regions = sum(region_counts.values()) or 1
    regions = sorted(
        [{"region": r, "signal_count": c, "confidence_pct": round(100 * c / total_regions)} for r, c in region_counts.items()],
        key=lambda x: x["confidence_pct"], reverse=True,
    )
    top_region = regions[0] if regions else None

    scores = [n.data_json.get("score", 0) for n in profile_nodes]
    cluster_conf = round(sum(scores[:5]) / len(scores[:5])) if scores else 0
    best_conf = round(max(scores)) if scores else 0
    best_lead = linked[0] if linked else None

    source_breakdown = Counter((n.data_json or {}).get("source_type", n.node_type) or n.node_type for n in graph_nodes)
    actor_breakdown = Counter((n.data_json or {}).get("apify_actor") for n in graph_nodes if (n.data_json or {}).get("apify_actor"))
    entity_breakdown = Counter(e.type for e in entities)

    from app.models import Post
    from app.agents import behaviour_agent, content_agent
    post_rows = db.query(Post).filter(Post.case_id == case.id).all()
    posts_dicts = [
        {"text": p.text, "timestamp": p.timestamp.isoformat() if p.timestamp else None,
         "hashtags": p.hashtags_json or []}
        for p in post_rows
    ]
    behaviour = behaviour_agent.analyze_behaviour(posts_dicts)
    content = content_agent.analyze_content(posts_dicts)
    by_handle: dict = {}
    for p in post_rows:
        by_handle.setdefault(p.handle, []).append(p.text)
    style = content_agent.cluster_style_cohesion(list(by_handle.values()))

    summary = (
        f"TraceNet expanded the submitted identifiers into {len(linked)} Apify/public-source lead(s), "
        f"{len(artifacts)} extracted artifact node(s), and {len(edges)} explainable graph edge(s). "
        f"Cluster confidence is {cluster_conf}%. This report separates seed identifiers from newly discovered "
        f"Apify dataset items so reviewers can see what came from live scraping versus what was typed into the case."
    )

    # ---- Key conclusions (bullet-ready, confidence-ranked findings) ----
    key_conclusions: list[dict] = []
    if best_lead:
        key_conclusions.append({
            "text": (
                f"Strongest public-source lead is {best_lead.get('platform') or 'a public profile'} "
                f"handle '{best_lead.get('handle') or 'unknown'}', matched from "
                f"{best_lead.get('matched_entity_type') or 'seed input'}."
            ),
            "confidence": round(best_lead.get("score", 0)),
            "tool": best_lead.get("platform") or best_lead.get("apify_actor") or "public",
        })
    if top_region:
        key_conclusions.append({
            "text": f"Probable region of activity is {top_region['region']} "
                    f"based on {top_region['signal_count']} independent public signal(s).",
            "confidence": top_region["confidence_pct"],
            "tool": "google",
        })
    if actor_breakdown:
        top_actor, top_actor_count = actor_breakdown.most_common(1)[0]
        key_conclusions.append({
            "text": f"Most productive Apify actor was '{top_actor}', contributing {top_actor_count} node(s).",
            "confidence": min(95, 50 + top_actor_count * 5),
            "tool": top_actor,
        })
    if artifacts:
        key_conclusions.append({
            "text": f"{len(artifacts)} public artifact(s) (email/phone/IP/domain) were extracted for corroboration.",
            "confidence": 70,
            "tool": "web",
        })
    key_conclusions.append({
        "text": f"Overall cluster confidence across the top leads is {cluster_conf}%. "
                f"Findings are investigative leads and require manual verification.",
        "confidence": cluster_conf,
        "tool": "apify",
    })

    return {
        "case_reference": case.reference_no,
        "case_title": case.title,
        "jurisdiction": case.jurisdiction,
        "lawful_purpose": case.lawful_purpose,
        "generated_at": datetime.utcnow().isoformat(),
        "executive_summary": summary,
        "graph_stats": {
            "nodes": len(graph_nodes),
            "edges": len(edges),
            "lead_nodes": len(linked),
            "artifact_nodes": len(artifacts),
            "actor_nodes": len(actor_nodes),
            "cluster_confidence": cluster_conf,
            "best_confidence": best_conf,
        },
        "best_confidence": best_conf,
        "key_conclusions": key_conclusions,
        "source_breakdown": dict(source_breakdown),
        "actor_breakdown": dict(actor_breakdown),
        "entity_breakdown": dict(entity_breakdown),
        "seed_entities": [{"type": e.type, "value": e.value} for e in entities],
        "identity_cluster": linked,
        "extracted_artifacts": artifacts,
        "location_assessment": (
            f"Probable location is {top_region['region']} with {top_region['confidence_pct']}% confidence based on "
            f"{top_region['signal_count']} independent signal(s)."
            if top_region else "Insufficient signals for regional inference."
        ),
        "behaviour_summary": (
            f"Dominant posting pattern is '{behaviour['pattern_label']}' "
            f"(peak window {behaviour['active_window']}), averaging {behaviour['posts_per_week']} posts/week "
            f"across {behaviour['post_count']} observed posts."
            if behaviour["post_count"] else "No timestamped activity available for behaviour analysis."
        ),
        "content_summary": (
            f"Overall content sentiment is '{content['sentiment']['label']}'. "
            f"Top recurring terms: {', '.join(k['term'] for k in content['top_keywords'][:5]) or 'insufficient text'}. "
            f"Cross-account writing-style cohesion is {style['cohesion']} "
            f"(1.0 = identical authorship style)."
        ),
        "behaviour": behaviour,
        "content": content,
        "style_cohesion": style,
        "evidence_table": [
            {"id": e.id, "type": e.type, "source": e.source, "title": e.title, "sha256": e.sha256,
             "confidence": e.confidence, "status": e.verification_status} for e in evidence
        ],
        "limitations": [
            "All findings are derived from Apify/public/authorized OSINT sources only.",
            "The graph explicitly separates seed inputs from Apify-returned dataset items and extracted artifacts.",
            "Email and phone handling is limited to public exact-match web results and public page text; no private account-enumeration checks are performed.",
            "IP artifacts are public strings from seed inputs, public search results, or public pages; the system does not use deceptive IP grabbers.",
            "No private account access, OTP flows, contact-sync, KYC data, retail-login checks, or credential/breach dumps were used.",
            "This report does NOT constitute final identity confirmation.",
        ],
        "recommended_next_steps": [
            "Open graph nodes with Apify badges and verify source URLs manually.",
            "Review extracted email/phone/IP/domain artifacts separately from original seed identifiers.",
            "Issue lawful preservation/legal requests for platform-side records if needed.",
            "Cross-check with additional corroborating evidence before any operational action.",
            "Obtain reviewer sign-off prior to closing or escalating the case.",
        ],
    }


@router.post("/{case_id}/report/generate")
def generate_report(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    data = _assemble_report_data(db, case)
    report = Report(case_id=case_id, report_json=data, status="draft")
    db.add(report)
    db.commit()
    db.refresh(report)
    log_action(db, "report.generated", user_id=user.id, case_id=case_id, target_type="report", target_id=report.id)
    return {"id": report.id, "report_json": report.report_json, "status": report.status}


@router.get("/{case_id}/report")
def get_latest_report(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.case_id == case_id).order_by(Report.generated_at.desc()).first()
    if not report:
        raise HTTPException(status_code=404, detail="No report generated yet")
    return {"id": report.id, "report_json": report.report_json, "status": report.status}


@router.post("/{case_id}/report/{report_id}/sign")
def sign_report(case_id: str, report_id: str, db: Session = Depends(get_db), user: User = Depends(require("report.sign"))):
    report = db.query(Report).filter(Report.id == report_id, Report.case_id == case_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = "signed"
    report.signed_by = user.id
    db.commit()
    log_action(db, "report.signed", user_id=user.id, case_id=case_id, target_type="report", target_id=report.id)
    return {"id": report.id, "status": report.status}


@router.get("/{case_id}/report/{report_id}/export")
def export_report_pdf(case_id: str, report_id: str, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id, Report.case_id == case_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    data = report.report_json

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.4 * cm, leftMargin=1.4 * cm, topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TraceTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#0f172a")))
    styles.add(ParagraphStyle(name="TraceH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#0f172a"), spaceBefore=10, spaceAfter=6))
    styles.add(ParagraphStyle(name="TraceBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#334155")))
    styles.add(ParagraphStyle(name="TraceSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=7, leading=9, textColor=colors.HexColor("#475569")))
    styles.add(ParagraphStyle(name="TraceKey", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#0f172a")))

    stats = data.get("graph_stats", {})
    best_conf = data.get("best_confidence", stats.get("best_confidence", 0))
    cluster_conf = stats.get("cluster_confidence", 0)

    story = []

    # ---- Title band ----
    title_tbl = Table([[
        tool_icon("apify", 26),
        Paragraph("TraceNet AI — Public OSINT Investigation Report", styles["TraceTitle"]),
    ]], colWidths=[1.1 * cm, 16.4 * cm])
    title_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(title_tbl)
    story.append(Paragraph(f"<b>Case:</b> {data.get('case_title')} &nbsp;&nbsp; <b>Reference:</b> {data.get('case_reference')}", styles["TraceBody"]))
    story.append(Paragraph(f"<b>Jurisdiction:</b> {data.get('jurisdiction')} &nbsp;&nbsp; <b>Status:</b> {report.status.upper()}", styles["TraceBody"]))
    story.append(Spacer(1, 8))

    # ---- Stat strip ----
    stat_table = Table([
        ["Nodes", "Edges", "Leads", "Artifacts", "Cluster", "Best"],
        [str(stats.get("nodes", 0)), str(stats.get("edges", 0)), str(stats.get("lead_nodes", 0)),
         str(stats.get("artifact_nodes", 0)), f"{cluster_conf}%", f"{best_conf}%"],
    ], colWidths=[2.7 * cm] * 6)
    stat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#e0f2fe")),
        ("TEXTCOLOR", (4, 1), (5, 1), colors.HexColor("#0891b2")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (4, 1), (5, 1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(stat_table)

    # ---- Confidence gauge + Key Conclusions side by side ----
    key_conclusions = data.get("key_conclusions", []) or []
    conclusion_flow = [Paragraph("Key Conclusions", styles["TraceH2"])]
    if key_conclusions:
        for kc in key_conclusions[:6]:
            conf = kc.get("confidence", 0)
            conclusion_flow.append(Paragraph(
                f"<font color='#0891b2'><b>[{conf}%]</b></font> {kc.get('text', '')}",
                styles["TraceKey"],
            ))
            conclusion_flow.append(Spacer(1, 3))
    else:
        conclusion_flow.append(Paragraph("No high-confidence conclusions reached yet.", styles["TraceBody"]))

    gauge_flow = [
        Paragraph("Best Confidence", styles["TraceH2"]),
        confidence_gauge(int(best_conf or 0)),
    ]
    combo = Table([[conclusion_flow, gauge_flow]], colWidths=[11.5 * cm, 6.0 * cm])
    combo.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(combo)

    story.append(Paragraph("Executive Summary", styles["TraceH2"]))
    story.append(Paragraph(data.get("executive_summary", ""), styles["TraceBody"]))

    # ---- Charts: source bar + actor donut ----
    story.append(Paragraph("Source & Actor Analytics", styles["TraceH2"]))
    source_items = sorted((data.get("source_breakdown") or {}).items(), key=lambda kv: kv[1], reverse=True)
    actor_items = sorted((data.get("actor_breakdown") or {}).items(), key=lambda kv: kv[1], reverse=True)
    charts = Table([[
        source_bar_chart(source_items),
        actor_donut(actor_items),
    ]], colWidths=[10.5 * cm, 7.0 * cm])
    charts.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(charts)

    # ---- Tools used (icon grid) ----
    story.append(Paragraph("Tools & Platforms Scraped", styles["TraceH2"]))
    tool_names: list[str] = []
    for k in list((data.get("source_breakdown") or {}).keys()):
        tool_names.append(k)
    for a in (data.get("actor_breakdown") or {}).keys():
        tool_names.append(a)
    for item in data.get("identity_cluster", []):
        if item.get("platform"):
            tool_names.append(item["platform"])
    # de-dupe by icon key
    seen_keys = set()
    tool_cells = []
    for name in tool_names:
        from app.routers.report_visuals import tool_key as _tk
        key = _tk(name)
        if key in seen_keys or key == "default":
            continue
        seen_keys.add(key)
        cell = Table([[tool_icon(name, 22)], [Paragraph(str(name).split("/")[-1][:14], styles["TraceSmall"])]],
                     colWidths=[2.6 * cm], rowHeights=[0.85 * cm, 0.5 * cm])
        cell.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        tool_cells.append(cell)
    if tool_cells:
        rows = [tool_cells[i:i + 6] for i in range(0, len(tool_cells), 6)]
        for r in rows:
            while len(r) < 6:
                r.append("")
        tool_grid = Table(rows, colWidths=[2.6 * cm] * 6)
        tool_grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story.append(tool_grid)
    else:
        story.append(Paragraph("No specific tool/platform icons detected.", styles["TraceBody"]))

    # ---- Top Leads (with icon per row) ----
    story.append(Paragraph("Top Leads", styles["TraceH2"]))
    lead_rows = [["", "Lead", "Source", "Score", "Reason"]]
    for item in data.get("identity_cluster", [])[:12]:
        lead_rows.append([
            tool_icon(item.get("platform") or item.get("apify_actor") or "web", 16),
            Paragraph(f"<b>{item.get('platform') or ''}</b><br/>{item.get('handle') or ''}<br/><font size='6'>{item.get('url') or ''}</font>", styles["TraceSmall"]),
            Paragraph(f"{item.get('source_type') or ''}<br/>{item.get('apify_actor') or ''}", styles["TraceSmall"]),
            f"{item.get('score', 0)}%",
            Paragraph("; ".join((item.get("reasons") or [])[:3]), styles["TraceSmall"]),
        ])
    lead_table = Table(lead_rows, colWidths=[0.8 * cm, 4.6 * cm, 4.1 * cm, 1.4 * cm, 6.1 * cm], repeatRows=1)
    lead_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(lead_table)

    # ---- Extracted Artifacts (with type icon) ----
    story.append(Paragraph("Extracted Artifacts", styles["TraceH2"]))
    artifact_rows = [["", "Type", "Value", "Origin"]]
    for a in data.get("extracted_artifacts", [])[:30]:
        artifact_rows.append([
            tool_icon(a.get("type", "web"), 14),
            a.get("type", ""), a.get("value", ""), a.get("origin", ""),
        ])
    if len(artifact_rows) == 1:
        artifact_rows.append(["", "No extracted artifacts", "", ""])
    artifact_table = Table(artifact_rows, colWidths=[0.8 * cm, 3.6 * cm, 8.2 * cm, 4.4 * cm], repeatRows=1)
    artifact_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (1, 1), (-1, -1), 8),
    ]))
    story.append(artifact_table)

    story.append(Paragraph("Limitations", styles["TraceH2"]))
    for lim in data.get("limitations", []):
        story.append(Paragraph(f"• {lim}", styles["TraceBody"]))
    story.append(Paragraph("Recommended Next Steps", styles["TraceH2"]))
    for step in data.get("recommended_next_steps", []):
        story.append(Paragraph(f"• {step}", styles["TraceBody"]))
    story.append(Spacer(1, 10))
    story.append(Paragraph("CONFIDENTIAL — LAW ENFORCEMENT / AUTHORIZED DEMO USE ONLY", styles["TraceSmall"]))

    doc.build(story)
    buf.seek(0)
    log_action(db, "report.exported", user_id=user.id, case_id=case_id, target_type="report", target_id=report.id)
    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=TraceNet_{data.get('case_reference')}.pdf"
    })
