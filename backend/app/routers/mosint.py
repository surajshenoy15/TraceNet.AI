from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.models import Case, OsintScanResult, User
from app.schemas import MosintEmailScanOut, MosintEmailScanRequest
from app.security import require
from app.services.mosint_service import run_mosint_email_scan

router = APIRouter(prefix="/cases", tags=["mosint"])


@router.post("/{case_id}/email-osint/mosint", response_model=MosintEmailScanOut)
def run_case_mosint_scan(
    case_id: str,
    payload: MosintEmailScanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require("analysis.run")),
):
    """Run a consent/authorization-gated MOSINT email scan for a case."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not payload.authorized:
        raise HTTPException(
            status_code=403,
            detail="Authorization confirmation is required before running email OSINT.",
        )

    scan = run_mosint_email_scan(payload.email)
    record_id = None

    should_persist = payload.persist and settings.mosint_store_results
    if should_persist:
        record = OsintScanResult(
            case_id=case.id,
            source="mosint",
            target_type="email",
            target_value=scan["target"],
            status="completed",
            result_json=scan["raw"],
            safe_summary_json=scan["safe_summary"],
            created_by=user.id,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        record_id = record.id

    log_action(
        db,
        "connector.mosint.email_scan",
        user_id=user.id,
        case_id=case.id,
        target_type="email",
        target_id=scan["target"],
        details={
            "source": "mosint",
            "persisted": bool(record_id),
            "signals_found": scan["safe_summary"].get("signals_found", 0),
            "sensitive_data_policy": "redacted_raw_leaks_credentials_tokens",
        },
    )

    return {
        "id": record_id,
        "case_id": case.id,
        "source": "mosint",
        "target": scan["target"],
        "safe_summary": scan["safe_summary"],
        "data": scan["raw"],
        "confidence_note": "OSINT output is an investigative lead, not final identity proof.",
    }
