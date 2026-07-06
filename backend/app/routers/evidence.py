import hashlib
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.audit import log_action
from app.database import get_db
from app.models import EvidenceItem, User
from app.schemas import EvidenceOut, EvidenceUpdate
from app.security import get_current_user, require

router = APIRouter(prefix="/cases", tags=["evidence"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/{case_id}/evidence", response_model=list[EvidenceOut])
def list_evidence(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(EvidenceItem).filter(EvidenceItem.case_id == case_id).order_by(
        EvidenceItem.created_at.desc()).all()


@router.post("/{case_id}/evidence/upload", response_model=EvidenceOut)
async def upload_evidence(case_id: str, file: UploadFile = File(...), db: Session = Depends(get_db),
                           user: User = Depends(require("evidence.upload"))):
    contents = await file.read()
    sha256 = hashlib.sha256(contents).hexdigest()
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    path = os.path.join(UPLOAD_DIR, safe_name)
    with open(path, "wb") as f:
        f.write(contents)

    ext = (file.filename or "").lower()
    etype = "image" if ext.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")) else "file"

    item = EvidenceItem(
        case_id=case_id, type=etype, source="uploaded", title=file.filename,
        file_path=path, sha256=sha256, confidence=0.9, verification_status="unreviewed",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, "evidence.uploaded", user_id=user.id, case_id=case_id, target_type="evidence",
               target_id=item.id, details={"filename": file.filename, "sha256": sha256})
    return item


@router.get("/{case_id}/evidence/{evidence_id}")
def view_evidence(case_id: str, evidence_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    item = db.query(EvidenceItem).filter(EvidenceItem.id == evidence_id, EvidenceItem.case_id == case_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Evidence not found")
    log_action(db, "evidence.viewed", user_id=user.id, case_id=case_id, target_type="evidence",
               target_id=item.id)
    return {
        "id": item.id, "type": item.type, "source": item.source, "title": item.title,
        "sha256": item.sha256, "confidence": item.confidence, "verification_status": item.verification_status,
        "note": item.note, "created_at": item.created_at,
    }


@router.patch("/{case_id}/evidence/{evidence_id}", response_model=EvidenceOut)
def update_evidence(case_id: str, evidence_id: str, payload: EvidenceUpdate, db: Session = Depends(get_db),
                     user: User = Depends(require("evidence.review"))):
    item = db.query(EvidenceItem).filter(EvidenceItem.id == evidence_id, EvidenceItem.case_id == case_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Evidence not found")
    if payload.verification_status:
        item.verification_status = payload.verification_status
    if payload.note is not None:
        item.note = payload.note
    db.commit()
    db.refresh(item)
    log_action(db, "review.action", user_id=user.id, case_id=case_id, target_type="evidence",
               target_id=item.id, details={"verification_status": item.verification_status})
    return item
