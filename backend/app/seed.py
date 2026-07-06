"""Bootstrap login users so the hackathon login screen works out of the box.
Run with:  python -m app.seed
Demo MFA code for every user is whatever DEMO_MFA_CODE is set to in .env (default 123456).
"""
from app.database import Base, engine, SessionLocal
from app.models import User, RoleEnum
from app.security import hash_password

DEMO_USERS = [
    {"name": "Inspector Rao", "email": "rao@agency.gov.in", "password": "demo1234", "role": RoleEnum.investigator,
     "unit": "Maharashtra Cybercrime Cell"},
    {"name": "Arjun Deshmukh", "email": "arjun@agency.gov.in", "password": "demo1234", "role": RoleEnum.investigator,
     "unit": "Maharashtra Cyber Cell"},
    {"name": "Meera Verma", "email": "meera@agency.gov.in", "password": "demo1234", "role": RoleEnum.reviewer,
     "unit": "Maharashtra Cyber Cell"},
    {"name": "Admin User", "email": "admin@agency.gov.in", "password": "demo1234", "role": RoleEnum.admin,
     "unit": "CERT-In"},
]


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for u in DEMO_USERS:
            existing = db.query(User).filter(User.email == u["email"]).first()
            if existing:
                continue
            db.add(User(
                name=u["name"], email=u["email"], hashed_password=hash_password(u["password"]),
                role=u["role"], unit=u["unit"], status="active",
            ))
        db.commit()
        print("Seeded login users:")
        for u in DEMO_USERS:
            print(f"  {u['email']} / {u['password']}  (role={u['role'].value})")
        print("MFA code for all demo users: see DEMO_MFA_CODE in .env (default 123456)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
