from sqlalchemy.orm import Session

from app.models import AuditLog


def log_action(
    db: Session,
    action: str,
    user_id: str | None = None,
    case_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict | None = None,
    ip_address: str = "127.0.0.1",
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        case_id=case_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        ip_address=ip_address,
        details_json=details or {},
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
