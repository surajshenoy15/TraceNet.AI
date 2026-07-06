from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, User
from app.security import get_current_user

router = APIRouter(prefix="/cases", tags=["audit"])
global_router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/{case_id}/audit")
def case_audit(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    logs = db.query(AuditLog).filter(AuditLog.case_id == case_id).order_by(AuditLog.created_at.asc()).all()
    return [
        {"id": l.id, "user_id": l.user_id, "action": l.action, "target_type": l.target_type,
         "target_id": l.target_id, "ip_address": l.ip_address, "details": l.details_json,
         "created_at": l.created_at} for l in logs
    ]


@global_router.get("")
def global_audit(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    return [
        {"id": l.id, "user_id": l.user_id, "case_id": l.case_id, "action": l.action,
         "target_type": l.target_type, "target_id": l.target_id, "ip_address": l.ip_address,
         "details": l.details_json, "created_at": l.created_at} for l in logs
    ]
