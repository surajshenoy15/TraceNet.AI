from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Entity, User
from app.schemas import EntityOut
from app.security import get_current_user

router = APIRouter(prefix="/cases", tags=["entities"])


@router.get("/{case_id}/entities", response_model=list[EntityOut])
def list_entities(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Entity).filter(Entity.case_id == case_id).all()


@router.get("/{case_id}/overview")
def case_overview(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models import GraphNode, EvidenceItem, Case

    case = db.query(Case).filter(Case.id == case_id).first()
    entities = db.query(Entity).filter(Entity.case_id == case_id).all()
    evidence = db.query(EvidenceItem).filter(EvidenceItem.case_id == case_id).all()
    profile_nodes = db.query(GraphNode).filter(GraphNode.case_id == case_id, GraphNode.node_type == "profile").all()

    scores = [n.data_json.get("score", 0) for n in profile_nodes if n.data_json]
    cluster_confidence = round(sum(scores[:5]) / len(scores[:5])) if scores else 0

    platforms = {n.data_json.get("platform") for n in profile_nodes if n.data_json.get("platform")}
    locations = [n.label for n in db.query(GraphNode).filter(GraphNode.case_id == case_id,
                                                               GraphNode.node_type == "location").all()]

    return {
        "case_id": case_id,
        "status": case.status if case else "unknown",
        "cluster_confidence": cluster_confidence,
        "accounts_found": len(profile_nodes),
        "platforms_count": len(platforms),
        "entities_count": len(entities),
        "evidence_count": len(evidence),
        "probable_locations": locations,
        "entities": [{"type": e.type, "value": e.value, "confidence": e.confidence} for e in entities],
    }
