from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Case, Entity, User
from app.security import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cases = db.query(Case).all()
    active = [c for c in cases if c.status in ("active", "under_review", "draft")]
    closed_this_month = [
        c for c in cases if c.status == "closed" and c.updated_at and
        c.updated_at >= datetime.utcnow().replace(day=1)
    ]
    entities_surfaced = db.query(Entity).count()

    return {
        "active_cases": len(active),
        "closed_this_month": len(closed_this_month),
        "entities_surfaced": entities_surfaced,
        "total_cases": len(cases),
    }
