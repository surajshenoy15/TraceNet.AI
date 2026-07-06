from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agents import behaviour_agent, content_agent
from app.database import get_db
from app.models import Post, User
from app.security import get_current_user

router = APIRouter(prefix="/cases", tags=["analysis"])


def _posts_as_dicts(rows: list[Post]) -> list[dict]:
    return [
        {
            "text": r.text,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "hashtags": r.hashtags_json or [],
        }
        for r in rows
    ]


@router.get("/{case_id}/behaviour")
def behaviour(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Post).filter(Post.case_id == case_id).all()
    return behaviour_agent.analyze_behaviour(_posts_as_dicts(rows))


@router.get("/{case_id}/content")
def content(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Post).filter(Post.case_id == case_id).all()
    result = content_agent.analyze_content(_posts_as_dicts(rows))

    # writing-style cohesion across the distinct matched accounts
    by_handle: dict[str, list[str]] = {}
    for r in rows:
        by_handle.setdefault(r.handle, []).append(r.text)
    result["style_cohesion"] = content_agent.cluster_style_cohesion(list(by_handle.values()))
    return result


@router.get("/{case_id}/timeline")
def timeline(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.query(Post)
        .filter(Post.case_id == case_id, Post.timestamp.isnot(None))
        .order_by(Post.timestamp.asc())
        .all()
    )
    return {
        "events": [
            {
                "timestamp": r.timestamp.isoformat(),
                "platform": r.platform,
                "handle": r.handle,
                "text": r.text,
                "sentiment": r.sentiment_label,
                "hashtags": r.hashtags_json or [],
            }
            for r in rows
        ]
    }


@router.get("/{case_id}/image-reuse")
def image_reuse(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models import Case
    from app.agents import image_agent
    case = db.query(Case).filter(Case.id == case_id).first()
    profiles = (case.matched_profiles_json or []) if case else []
    return {"groups": image_agent.find_image_reuse(profiles)}


@router.get("/{case_id}/interactions")
def interactions(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models import Case
    from app.agents import interaction_agent
    case = db.query(Case).filter(Case.id == case_id).first()
    profiles = (case.matched_profiles_json or []) if case else []
    return interaction_agent.build_interaction_network(profiles)


@router.get("/{case_id}/style-pairs")
def style_pairs(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Per-account-pair writing-style similarity (authorship comparison)."""
    from app.agents import content_agent
    rows = db.query(Post).filter(Post.case_id == case_id).all()
    by_handle: dict[str, list[str]] = {}
    for r in rows:
        by_handle.setdefault(r.handle, []).append(r.text)
    handles = list(by_handle.keys())
    fps = {h: content_agent.style_fingerprint(t) for h, t in by_handle.items()}
    pairs = []
    for i in range(len(handles)):
        for j in range(i + 1, len(handles)):
            a, b = handles[i], handles[j]
            pairs.append({"a": a, "b": b, "similarity": content_agent.style_similarity(fps[a], fps[b])})
    pairs.sort(key=lambda x: x["similarity"], reverse=True)
    return {"pairs": pairs, "note": "Cosine similarity of stylometric fingerprints (1.0 = identical writing style)."}


@router.get("/{case_id}/conclusion")
def conclusion(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models import Case
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case or not case.conclusion_json:
        return {"available": False, "note": "Run analysis to generate a conclusion."}
    return {"available": True, **case.conclusion_json}
