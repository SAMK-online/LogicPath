from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, conflict, not_found
from app.models import ChatMessage, CodingSession, Problem, Roadmap, RoadmapProblem, Submission
from app.models._common import utcnow
from app.schemas.learning import SessionOut
from app.services import progress as progress_service


def get_owned_session(db: Session, session_id: str, user_id: str) -> CodingSession:
    """Single choke point for ownership. Other users' sessions look identical to missing ones (404, not 403)."""
    row = db.scalar(select(CodingSession).where(CodingSession.id == session_id, CodingSession.user_id == user_id))
    if row is None:
        raise not_found("Coding session not found")
    return row


def get_or_create(db: Session, user_id: str, problem_id: str, roadmap_id: str | None) -> tuple[CodingSession, bool]:
    problem = db.get(Problem, problem_id)
    if problem is None:
        raise not_found("Problem not found")
    if not problem.is_available:
        raise conflict("problem_unavailable", "This problem's content hasn't been written yet")
    if roadmap_id is not None:
        if db.get(Roadmap, roadmap_id) is None:
            raise not_found("Roadmap not found")
        in_roadmap = db.scalar(select(RoadmapProblem.problem_id).where(
            RoadmapProblem.roadmap_id == roadmap_id, RoadmapProblem.problem_id == problem_id))
        if in_roadmap is None:
            raise AppError(422, "roadmap_mismatch", "That problem is not part of the given roadmap")

    # Two requests can race to create the same (user, problem) session, e.g. React StrictMode runs effects twice in dev,
    # or a double click. The unique constraint decides the winner; the loser rolls back and re-reads on the second pass.
    for _ in range(2):
        try:
            existing = db.scalar(select(CodingSession).where(CodingSession.user_id == user_id, CodingSession.problem_id == problem_id))
            created = existing is None
            if existing is None:
                existing = CodingSession(user_id=user_id, problem_id=problem_id, roadmap_id=roadmap_id,
                                         saved_code=problem.starter_code, code_version=1,
                                         learning_state={"hint_level": 0, "hints_used": 0})
                db.add(existing)
            elif roadmap_id and existing.roadmap_id != roadmap_id:
                existing.roadmap_id = roadmap_id  # the roadmap the student opened it from drives tutor style
            progress_service.touch(db, user_id, problem_id)
            db.commit()
            return existing, created
        except IntegrityError:
            db.rollback()
    raise conflict("session_conflict", "Could not open the workspace. Please try again.")


def save_code(db: Session, cs: CodingSession, code: str) -> bool:
    """Persist code if it differs from the saved version and bump the version. Does NOT commit."""
    if code == cs.saved_code:
        return False
    cs.saved_code = code
    cs.code_version += 1
    cs.updated_at = utcnow()
    return True


def to_out(db: Session, cs: CodingSession) -> SessionOut:
    from app.schemas.learning import ChatMessageOut, SubmissionOut
    from app.services.tutor.llm import tutor_mode

    last = db.scalar(select(Submission).where(Submission.coding_session_id == cs.id).order_by(Submission.id.desc()).limit(1))
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.coding_session_id == cs.id).order_by(ChatMessage.id)).all()
    return SessionOut(
        id=cs.id, problem_id=cs.problem_id, roadmap_id=cs.roadmap_id, saved_code=cs.saved_code,
        code_version=cs.code_version, updated_at=cs.updated_at,
        messages=[ChatMessageOut.model_validate(m) for m in msgs],
        last_submission=SubmissionOut.model_validate(last) if last else None,
        hint_level=int((cs.learning_state or {}).get("hint_level", 0)), tutor_mode=tutor_mode(get_settings()),
    )
