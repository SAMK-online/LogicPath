from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import not_found
from app.models import Problem, Roadmap, RoadmapProblem, UserProgress
from app.schemas.catalog import ProblemRef, RoadmapDetail, RoadmapSummary, TopicOut


def _status_map(db: Session, user_id: str) -> dict[str, str]:
    rows = db.execute(select(UserProgress.problem_id, UserProgress.completion_status).where(UserProgress.user_id == user_id))
    return {pid: st for pid, st in rows}


def _build(roadmap: Roadmap, statuses: dict[str, str]) -> RoadmapDetail:
    topics: dict[str, list[ProblemRef]] = {}
    for rp in roadmap.problems:  # already ordered by sequence_order
        p = rp.problem
        topics.setdefault(rp.topic, []).append(
            ProblemRef(id=p.id, title=p.title, difficulty=p.difficulty, is_available=p.is_available,
                       status=statuses.get(p.id, "not_started") if p.is_available else "not_started")
        )
    flat = [p for ps in topics.values() for p in ps]
    done = sum(p.status == "completed" for p in flat)
    nxt = next((p.id for p in flat if p.is_available and p.status != "completed"), None)
    return RoadmapDetail(
        id=roadmap.id, title=roadmap.title, description=roadmap.description, difficulty=roadmap.difficulty,
        total_problems=len(flat), available_problems=sum(p.is_available for p in flat), completed_problems=done,
        progress_percent=round(100 * done / len(flat)) if flat else 0, next_problem_id=nxt,
        topics=[TopicOut(name=n, total=len(ps), completed=sum(p.status == "completed" for p in ps), problems=ps)
                for n, ps in topics.items()],
    )


def _load_roadmaps(db: Session) -> list[Roadmap]:
    stmt = (select(Roadmap).options(selectinload(Roadmap.problems).joinedload(RoadmapProblem.problem))
            .order_by(Roadmap.sort_order))
    return list(db.scalars(stmt).unique())


def list_roadmaps(db: Session, user_id: str) -> list[RoadmapSummary]:
    statuses = _status_map(db, user_id)
    out = []
    for r in _load_roadmaps(db):
        d = _build(r, statuses)
        out.append(RoadmapSummary(**d.model_dump(exclude={"topics"})))
    return out


def get_roadmap(db: Session, roadmap_id: str, user_id: str) -> RoadmapDetail:
    stmt = (select(Roadmap).options(selectinload(Roadmap.problems).joinedload(RoadmapProblem.problem))
            .where(Roadmap.id == roadmap_id))
    roadmap = db.scalars(stmt).unique().one_or_none()
    if roadmap is None:
        raise not_found("Roadmap not found")
    return _build(roadmap, _status_map(db, user_id))


def list_problems(db: Session, *, roadmap_id: str | None = None) -> list[Problem]:
    stmt = select(Problem).order_by(Problem.title)
    if roadmap_id:
        stmt = (select(Problem).join(RoadmapProblem, RoadmapProblem.problem_id == Problem.id)
                .where(RoadmapProblem.roadmap_id == roadmap_id).order_by(RoadmapProblem.sequence_order))
    return list(db.scalars(stmt))


def get_problem(db: Session, problem_id: str) -> Problem:
    problem = db.get(Problem, problem_id)
    if problem is None:
        raise not_found("Problem not found")
    return problem
