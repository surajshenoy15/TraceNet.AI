import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

# In-memory store for demo MFA pending sessions (hackathon scope only)
_pending_mfa: dict[str, dict] = {}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_pending_mfa(user_id: str) -> str:
    token = uuid.uuid4().hex
    _pending_mfa[token] = {"user_id": user_id, "expires": datetime.utcnow() + timedelta(minutes=5)}
    return token


def resolve_pending_mfa(token: str) -> Optional[str]:
    entry = _pending_mfa.get(token)
    if not entry:
        return None
    if entry["expires"] < datetime.utcnow():
        _pending_mfa.pop(token, None)
        return None
    return entry["user_id"]


def consume_pending_mfa(token: str) -> None:
    _pending_mfa.pop(token, None)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except JWTError:
        return None


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Role-Based Access Control (RBAC)
# ---------------------------------------------------------------------------
from app.models import RoleEnum

# Permission matrix — single source of truth used by both API and frontend.
PERMISSIONS = {
    RoleEnum.investigator: {
        "case.create", "case.edit", "input.add", "analysis.run",
        "evidence.upload", "evidence.view", "report.generate", "graph.view",
        "entities.view", "case.view", "audit.view",
    },
    RoleEnum.reviewer: {
        "case.view", "evidence.view", "evidence.review", "graph.view",
        "entities.view", "report.generate", "report.sign", "link.approve",
        "link.reject", "audit.view",
    },
    RoleEnum.admin: {
        "case.create", "case.edit", "case.view", "input.add", "analysis.run",
        "evidence.upload", "evidence.view", "evidence.review", "report.generate",
        "report.sign", "graph.view", "entities.view", "audit.view",
        "link.approve", "link.reject", "user.manage", "settings.manage",
    },
    RoleEnum.auditor: {
        "case.view", "audit.view", "report.view", "entities.view", "graph.view",
    },
}


def role_permissions(role) -> list[str]:
    try:
        r = role if isinstance(role, RoleEnum) else RoleEnum(role)
    except ValueError:
        return []
    return sorted(PERMISSIONS.get(r, set()))


def has_permission(user: "User", perm: str) -> bool:
    try:
        r = user.role if isinstance(user.role, RoleEnum) else RoleEnum(user.role)
    except ValueError:
        return False
    return perm in PERMISSIONS.get(r, set())


def require(*perms: str):
    """FastAPI dependency factory: allow only users holding ALL listed perms."""
    def _checker(user: "User" = Depends(get_current_user)) -> "User":
        for p in perms:
            if not has_permission(user, p):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your role ({user.role.value if hasattr(user.role,'value') else user.role}) "
                           f"lacks permission: {p}",
                )
        return user
    return _checker
