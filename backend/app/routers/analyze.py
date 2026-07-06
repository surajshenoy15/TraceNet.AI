from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.orchestrator import run_pipeline, ScopeError
from app.database import get_db
from app.models import Case, User
from app.security import get_current_user, require

router = APIRouter(prefix="/cases", tags=["analyze"])


@router.post("/{case_id}/analyze")
def analyze_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(require("analysis.run"))):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    try:
        result = run_pipeline(db, case, user_id=user.id)
    except ScopeError as exc:
        raise HTTPException(status_code=422, detail=f"Case scope check failed: {exc}")
    return {
        "case_id": case.id,
        "cluster_confidence": result["cluster_confidence"],
        "entities_found": len(result["entities"]),
        "matches_found": len(result["matches"]),
        "regions": result["regions"],
    }
