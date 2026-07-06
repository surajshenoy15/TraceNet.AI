import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, Enum
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


class RoleEnum(str, enum.Enum):
    investigator = "investigator"
    reviewer = "reviewer"
    admin = "admin"
    auditor = "auditor"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: gen_id("USR"))
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.investigator)
    unit = Column(String, default="Demo Cybercrime Unit")
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)


class Case(Base):
    __tablename__ = "cases"

    id = Column(String, primary_key=True, default=lambda: gen_id("CASE"))
    title = Column(String, nullable=False)
    reference_no = Column(String, unique=True, nullable=False)
    jurisdiction = Column(String, nullable=False)
    priority = Column(String, default="medium")
    lawful_purpose = Column(Text, nullable=False)
    legal_authority_ref = Column(String, nullable=True)
    status = Column(String, default="draft")  # draft, active, under_review, closed
    assigned_to = Column(String, ForeignKey("users.id"), nullable=True)
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=True)
    matched_profiles_json = Column(JSON, default=list)
    conclusion_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    inputs = relationship("CaseInput", backref="case", cascade="all, delete-orphan")
    entities = relationship("Entity", backref="case", cascade="all, delete-orphan")
    evidence_items = relationship("EvidenceItem", backref="case", cascade="all, delete-orphan")
    matches = relationship("Match", backref="case", cascade="all, delete-orphan")
    nodes = relationship("GraphNode", backref="case", cascade="all, delete-orphan")
    edges = relationship("GraphEdge", backref="case", cascade="all, delete-orphan")
    reports = relationship("Report", backref="case", cascade="all, delete-orphan")


class CaseInput(Base):
    __tablename__ = "case_inputs"

    id = Column(String, primary_key=True, default=lambda: gen_id("INP"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    input_type = Column(String, default="text")  # text, url, file, chat
    raw_value = Column(Text, nullable=False)
    file_path = Column(String, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Entity(Base):
    __tablename__ = "entities"

    id = Column(String, primary_key=True, default=lambda: gen_id("ENT"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    type = Column(String, nullable=False)  # username, phone, email, upi, url, location, keyword
    value = Column(String, nullable=False)
    source_input_id = Column(String, ForeignKey("case_inputs.id"), nullable=True)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(String, primary_key=True, default=lambda: gen_id("PROF"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    platform = Column(String, nullable=False)
    handle = Column(String, nullable=False)
    url = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    email_pattern = Column(String, nullable=True)
    source_type = Column(String, default="public_source")  # github_api, gravatar, apify_maigret, apify_public_search, user_provided


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id = Column(String, primary_key=True, default=lambda: gen_id("EVD"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    type = Column(String, nullable=False)  # image, text, url, chat, file
    source = Column(String, nullable=False)  # uploaded, public_source, github_api, apify_maigret, apify_public_search
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=True)
    sha256 = Column(String, nullable=True)
    confidence = Column(Float, default=0.5)
    verification_status = Column(String, default="unreviewed")  # unreviewed, verified, rejected, excluded
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Match(Base):
    __tablename__ = "matches"

    id = Column(String, primary_key=True, default=lambda: gen_id("MTCH"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    source_entity_id = Column(String, nullable=True)
    target_profile_id = Column(String, nullable=True)
    relation_type = Column(String, default="similar_to")
    confidence = Column(Float, default=0.0)
    reasons_json = Column(JSON, default=list)
    limitations = Column(Text, default="Public-source only; requires human verification")


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id = Column(String, primary_key=True, default=lambda: gen_id("NODE"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    node_type = Column(String, nullable=False)
    label = Column(String, nullable=False)
    data_json = Column(JSON, default=dict)


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id = Column(String, primary_key=True, default=lambda: gen_id("EDGE"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    source_node = Column(String, nullable=False)
    target_node = Column(String, nullable=False)
    relation = Column(String, default="related_to")
    confidence = Column(Float, default=0.0)
    reason = Column(String, default="")


class Post(Base):
    __tablename__ = "posts"

    id = Column(String, primary_key=True, default=lambda: gen_id("POST"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    platform = Column(String, nullable=False)
    handle = Column(String, nullable=False)
    text = Column(Text, default="")
    hashtags_json = Column(JSON, default=list)
    timestamp = Column(DateTime, nullable=True)
    sentiment_label = Column(String, default="neutral")
    hour = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=lambda: gen_id("RPT"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    report_json = Column(JSON, default=dict)
    status = Column(String, default="draft")  # draft, signed
    signed_by = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: gen_id("AUD"))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    ip_address = Column(String, default="127.0.0.1")
    details_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class OsintScanResult(Base):
    __tablename__ = "osint_scan_results"

    id = Column(String, primary_key=True, default=lambda: gen_id("OSR"))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False, index=True)
    source = Column(String, default="mosint")
    target_type = Column(String, default="email")
    target_value = Column(String, nullable=False, index=True)
    status = Column(String, default="completed")
    result_json = Column(JSON, default=dict)
    safe_summary_json = Column(JSON, default=dict)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
