from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: str
    password: str
    unit: Optional[str] = None


class LoginResponse(BaseModel):
    mfa_required: bool
    pending_token: str


class MfaVerifyRequest(BaseModel):
    pending_token: str
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ---------- Case ----------
class CaseCreate(BaseModel):
    title: str
    jurisdiction: str
    priority: str = "medium"
    lawful_purpose: str = Field(min_length=50)
    legal_authority_ref: Optional[str] = None


class CaseOut(BaseModel):
    id: str
    title: str
    reference_no: str
    jurisdiction: str
    priority: str
    lawful_purpose: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Case Input ----------
class CaseInputCreate(BaseModel):
    input_type: str = "text"
    raw_value: str


class CaseInputOut(BaseModel):
    id: str
    case_id: str
    input_type: str
    raw_value: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Entity ----------
class EntityOut(BaseModel):
    id: str
    case_id: str
    type: str
    value: str
    confidence: float

    class Config:
        from_attributes = True


# ---------- Evidence ----------
class EvidenceOut(BaseModel):
    id: str
    case_id: str
    type: str
    source: str
    title: str
    sha256: Optional[str]
    confidence: float
    verification_status: str
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class EvidenceUpdate(BaseModel):
    verification_status: Optional[str] = None
    note: Optional[str] = None


# ---------- Graph ----------
class GraphNodeOut(BaseModel):
    id: str
    node_type: str
    label: str
    data: dict

    class Config:
        from_attributes = True


class GraphEdgeOut(BaseModel):
    id: str
    source: str
    target: str
    relation: str
    confidence: float
    reason: str


class GraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


# ---------- Report ----------
class ReportOut(BaseModel):
    id: str
    case_id: str
    report_json: dict
    status: str
    generated_at: datetime

    class Config:
        from_attributes = True


# ---------- Audit ----------
class AuditOut(BaseModel):
    id: str
    user_id: Optional[str]
    action: str
    target_type: Optional[str]
    target_id: Optional[str]
    ip_address: str
    details_json: dict
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- MOSINT Email OSINT ----------
class MosintEmailScanRequest(BaseModel):
    email: str
    authorized: bool = Field(
        default=False,
        description="Must be true. Use only for owned, consent-based, or legally authorized testing.",
    )
    persist: bool = True


class MosintEmailScanOut(BaseModel):
    id: Optional[str] = None
    case_id: str
    source: str = "mosint"
    target: str
    safe_summary: dict
    data: dict
    confidence_note: str = "OSINT output is an investigative lead, not final identity proof."
