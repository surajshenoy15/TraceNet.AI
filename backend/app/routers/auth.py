from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, LoginResponse, MfaVerifyRequest, TokenResponse
from app.security import (
    verify_password, create_pending_mfa, resolve_pending_mfa,
    consume_pending_mfa, create_access_token, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    pending_token = create_pending_mfa(user.id)
    return LoginResponse(mfa_required=True, pending_token=pending_token)


@router.post("/verify-mfa", response_model=TokenResponse)
def verify_mfa(payload: MfaVerifyRequest, db: Session = Depends(get_db)):
    user_id = resolve_pending_mfa(payload.pending_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="MFA session expired, please login again")
    if payload.code != settings.demo_mfa_code:
        raise HTTPException(status_code=401, detail="Invalid MFA code")
    consume_pending_mfa(payload.pending_token)

    user = db.query(User).filter(User.id == user_id).first()
    token = create_access_token(user.id)
    log_action(db, "auth.login", user_id=user.id, details={"email": user.email})
    from app.security import role_permissions
    return TokenResponse(access_token=token, user={
        "id": user.id, "name": user.name, "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "unit": user.unit, "permissions": role_permissions(user.role),
    })


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    from app.security import role_permissions
    return {"id": user.id, "name": user.name, "email": user.email,
            "role": user.role.value if hasattr(user.role, "value") else user.role,
            "unit": user.unit, "permissions": role_permissions(user.role)}
