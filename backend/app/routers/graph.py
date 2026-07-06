from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import GraphNode, GraphEdge, User
from app.security import get_current_user

router = APIRouter(prefix="/cases", tags=["graph"])


@router.get("/{case_id}/graph")
def get_graph(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    nodes = db.query(GraphNode).filter(GraphNode.case_id == case_id).all()
    edges = db.query(GraphEdge).filter(GraphEdge.case_id == case_id).all()
    return {
        "nodes": [{"id": n.id, "node_type": n.node_type, "label": n.label, "data": n.data_json} for n in nodes],
        "edges": [{"id": e.id, "source": e.source_node, "target": e.target_node,
                    "relation": e.relation, "confidence": e.confidence, "reason": e.reason} for e in edges],
    }


@router.get("/{case_id}/map")
def get_map(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Aggregated regional confidence for the Map screen - never exact coordinates."""
    locations = db.query(GraphNode).filter(GraphNode.case_id == case_id, GraphNode.node_type == "location").all()
    edges = db.query(GraphEdge).filter(GraphEdge.case_id == case_id, GraphEdge.relation == "located_at").all()

    counts = {}
    for e in edges:
        counts[e.target_node] = counts.get(e.target_node, 0) + 1
    total = sum(counts.values()) or 1

    result = []
    for loc in locations:
        c = counts.get(loc.id, 0)
        result.append({"region": loc.label, "signals": c, "confidence_pct": round(100 * c / total)})
    result.sort(key=lambda x: x["confidence_pct"], reverse=True)
    return {"locations": result, "disclaimer": "Regional inference only. Not real-time or exact location."}
