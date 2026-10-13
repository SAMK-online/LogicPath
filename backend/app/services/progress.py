from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CodingSession, Problem, UserProgress
from app.models._common import utcnow
from app.schemas.learning import ProgressItem, ProgressOut


def touch(db: Session, user_id: str, problem_id: str) -> UserProgress:
    """Ensure a progress row exists and mark it as recently worked on (not committed)."""
    row = db.get(UserProgress, (user_id, problem_id))
    if row is None:
        row = UserProgress(user_id=user_id, problem_id=problem_id, completion_status="in_progress", attempts=0)
        db.add(row)
    elif row.completion_status == "not_started":
        row.completion_status = "in_progress"
    row.last_attempted_at = utcnow()
    return row


def record_attempt(db: Session, user_id: str, problem_id: str, *, all_passed: bool) -> UserProgress:
    row = touch(db, user_id, problem_id)
    row.attempts = (row.attempts or 0) + 1
    if all_passed and row.completion_status != "completed":
        row.completion_status = "completed"
        row.completed_at = utcnow()
    return row  # completion is sticky: a later failing run doesn't un-complete a problem


def get_progress(db: Session, user_id: str) -> ProgressOut:
    rows = db.execute(
        select(UserProgress, Problem.title, Problem.difficulty)
        .join(Problem, Problem.id == UserProgress.problem_id).where(UserProgress.user_id == user_id)
    ).all()
    roadmap_by_problem = dict(db.execute(
        select(CodingSession.problem_id, CodingSession.roadmap_id).where(CodingSession.user_id == user_id)).all())
    items = [
        ProgressItem(problem_id=p.problem_id, title=t, difficulty=d, status=p.completion_status, attempts=p.attempts,
                     last_attempted_at=p.last_attempted_at, completed_at=p.completed_at,
                     roadmap_id=roadmap_by_problem.get(p.problem_id))
        for p, t, d in rows
    ]
    recent = sorted((i for i in items if i.last_attempted_at), key=lambda i: i.last_attempted_at, reverse=True)[:5]  # type: ignore[arg-type, return-value]
    total = db.scalar(select(func.count()).select_from(Problem).where(Problem.is_available.is_(True))) or 0
    return ProgressOut(total_available=total, completed=sum(i.status == "completed" for i in items),
                       in_progress=sum(i.status == "in_progress" for i in items), problems=items, recent=recent)
