from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import random

from app.audit import log_action
from app.database import get_db
from app.models import Case, User
from app.schemas import CaseCreate, CaseOut
from app.security import get_current_user, require

router = APIRouter(prefix="/cases", tags=["cases"])


def _gen_reference(jurisdiction_code: str = "MH") -> str:
    from datetime import datetime
    now = datetime.utcnow()
    return f"TRN-{jurisdiction_code}-{now.year}-{now.strftime('%m%d')}-{random.randint(1000, 9999)}"


@router.get("", response_model=list[CaseOut])
def list_cases(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Case).order_by(Case.created_at.desc()).all()


@router.post("", response_model=CaseOut)
def create_case(payload: CaseCreate, db: Session = Depends(get_db), user: User = Depends(require("case.create"))):
    case = Case(
        title=payload.title,
        reference_no=_gen_reference(),
        jurisdiction=payload.jurisdiction,
        priority=payload.priority,
        lawful_purpose=payload.lawful_purpose,
        legal_authority_ref=payload.legal_authority_ref,
        status="draft",
        assigned_to=user.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    log_action(db, "case.created", user_id=user.id, case_id=case.id, target_type="case", target_id=case.id,
               details={"title": case.title, "reference_no": case.reference_no})
    return case


@router.get("/{case_id}", response_model=CaseOut)
def get_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.post("/{case_id}/launch", response_model=CaseOut)
def launch_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(require("analysis.run"))):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    case.status = "active"
    db.commit()
    db.refresh(case)
    log_action(db, "case.launched", user_id=user.id, case_id=case.id, target_type="case", target_id=case.id)
    return case
