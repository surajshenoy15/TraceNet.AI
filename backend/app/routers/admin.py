from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.audit import log_action
from app.database import get_db
from app.models import User, RoleEnum, Case
from app.security import require, hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "investigator"
    unit: str = "Demo Cybercrime Unit"


class UserUpdate(BaseModel):
    role: str | None = None
    status: str | None = None
    unit: str | None = None


def _serialize(u: User) -> dict:
    return {
        "id": u.id, "name": u.name, "email": u.email,
        "role": u.role.value if hasattr(u.role, "value") else u.role,
        "unit": u.unit, "status": u.status,
        "created_at": u.created_at,
    }


@router.get("/users")
def list_users(db: Session = Depends(get_db), admin: User = Depends(require("user.manage"))):
    return [_serialize(u) for u in db.query(User).order_by(User.created_at.asc()).all()]


@router.post("/users")
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require("user.manage"))):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="A user with that email already exists.")
    try:
        role = RoleEnum(payload.role)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid role: {payload.role}")
    u = User(name=payload.name, email=payload.email, hashed_password=hash_password(payload.password),
             role=role, unit=payload.unit, status="active")
    db.add(u)
    db.commit()
    db.refresh(u)
    log_action(db, "admin.user_created", user_id=admin.id, target_type="user", target_id=u.id,
               details={"email": u.email, "role": payload.role})
    return _serialize(u)


@router.patch("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(require("user.manage"))):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.role:
        try:
            u.role = RoleEnum(payload.role)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid role: {payload.role}")
    if payload.status:
        u.status = payload.status
    if payload.unit:
        u.unit = payload.unit
    db.commit()
    db.refresh(u)
    log_action(db, "admin.user_updated", user_id=admin.id, target_type="user", target_id=u.id,
               details=payload.model_dump(exclude_none=True))
    return _serialize(u)


@router.get("/stats")
def admin_stats(db: Session = Depends(get_db), admin: User = Depends(require("user.manage"))):
    users = db.query(User).all()
    by_role = {}
    for u in users:
        r = u.role.value if hasattr(u.role, "value") else u.role
        by_role[r] = by_role.get(r, 0) + 1
    return {
        "total_users": len(users),
        "active_cases": db.query(Case).filter(Case.status.in_(["active", "under_review", "draft"])).count(),
        "by_role": by_role,
        "roles_available": [r.value for r in RoleEnum],
    }
