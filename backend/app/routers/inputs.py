from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.entity_agent import extract_entities
from app.audit import log_action
from app.database import get_db
from app.models import Case, CaseInput, User
from app.schemas import CaseInputCreate, CaseInputOut
from app.security import get_current_user

router = APIRouter(prefix="/cases", tags=["inputs"])


@router.post("/{case_id}/inputs", response_model=CaseInputOut)
def add_input(case_id: str, payload: CaseInputCreate, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    inp = CaseInput(case_id=case_id, input_type=payload.input_type, raw_value=payload.raw_value,
                     created_by=user.id)
    db.add(inp)
    db.commit()
    db.refresh(inp)
    log_action(db, "input.added", user_id=user.id, case_id=case_id, target_type="case_input", target_id=inp.id,
               details={"input_type": inp.input_type})
    return inp


@router.get("/{case_id}/inputs", response_model=list[CaseInputOut])
def list_inputs(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(CaseInput).filter(CaseInput.case_id == case_id).all()


@router.post("/{case_id}/inputs/preview")
def preview_entities(case_id: str, payload: CaseInputCreate, user: User = Depends(get_current_user)):
    """Live entity preview as the officer types - does not persist anything."""
    return {"entities": extract_entities(payload.raw_value)}


@router.delete("/{case_id}/inputs/{input_id}")
def delete_input(case_id: str, input_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    inp = db.query(CaseInput).filter(CaseInput.id == input_id, CaseInput.case_id == case_id).first()
    if not inp:
        raise HTTPException(status_code=404, detail="Input not found")
    db.delete(inp)
    db.commit()
    return {"deleted": True}
