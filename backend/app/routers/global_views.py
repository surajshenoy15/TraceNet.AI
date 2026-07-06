from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Entity, Report, EvidenceItem, Case, GraphNode, User
from app.security import get_current_user

router = APIRouter(prefix="/global", tags=["global"])


@router.get("/entities")
def all_entities(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Entity).order_by(Entity.created_at.desc()).all()
    case_titles = {c.id: c.title for c in db.query(Case).all()}
    return [
        {"id": e.id, "type": e.type, "value": e.value, "confidence": e.confidence,
         "case_id": e.case_id, "case_title": case_titles.get(e.case_id, "—")}
        for e in rows
    ]


@router.get("/reports")
def all_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Report).order_by(Report.generated_at.desc()).all()
    case_map = {c.id: c for c in db.query(Case).all()}
    out = []
    for r in rows:
        c = case_map.get(r.case_id)
        out.append({
            "id": r.id, "case_id": r.case_id, "status": r.status,
            "generated_at": r.generated_at,
            "case_title": c.title if c else "—",
            "reference_no": c.reference_no if c else "—",
        })
    return out


@router.get("/collections")
def all_collections(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Every evidence item across all cases = the evidence collection."""
    rows = db.query(EvidenceItem).order_by(EvidenceItem.created_at.desc()).all()
    case_titles = {c.id: c.title for c in db.query(Case).all()}
    return [
        {"id": e.id, "type": e.type, "source": e.source, "title": e.title,
         "sha256": e.sha256, "confidence": e.confidence, "status": e.verification_status,
         "case_id": e.case_id, "case_title": case_titles.get(e.case_id, "—"),
         "created_at": e.created_at}
        for e in rows
    ]


@router.get("/alerts")
def all_alerts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Derived alerts: high-confidence profile clusters worth reviewer attention."""
    nodes = db.query(GraphNode).filter(GraphNode.node_type == "profile").all()
    case_map = {c.id: c for c in db.query(Case).all()}
    alerts = []
    for n in nodes:
        score = (n.data_json or {}).get("score", 0)
        if score >= 70:
            c = case_map.get(n.case_id)
            alerts.append({
                "id": n.id, "level": "high" if score >= 90 else "medium",
                "title": f"High-confidence match: {n.label}",
                "score": score, "case_id": n.case_id,
                "case_title": c.title if c else "—",
                "platform": (n.data_json or {}).get("platform"),
            })
    alerts.sort(key=lambda x: x["score"], reverse=True)
    return alerts
