"""Idempotent catalog seeding from shared/problem-fixtures (also: python -m app.db.seed)."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Problem, Roadmap, RoadmapProblem

log = logging.getLogger("app.seed")
PLACEHOLDER = "The statement and test cases for this problem have not been written yet. It is listed so the roadmap keeps its established structure."


def _load(path: Path):
    return json.loads(path.read_text())


def seed_catalog(db: Session, fixtures_dir: Path) -> None:
    problems_dir = fixtures_dir / "problems"
    existing = {p.id: p for p in db.query(Problem).all()}
    wanted: set[str] = set()

    def upsert(pid: str, **fields) -> None:
        wanted.add(pid)
        row = existing.get(pid)
        if row is None:
            db.add(Problem(id=pid, **fields))
        else:
            for k, v in fields.items():
                setattr(row, k, v)

    for f in sorted(problems_dir.glob("*.json")):
        d = _load(f)
        upsert(d["id"], title=d["title"], description=d["description"], difficulty=d["difficulty"], topic=d["topic"],
               starter_code=d["starter_code"], function_signature=d["function_signature"], test_cases=d["test_cases"],
               examples=d.get("examples", []), constraints=d.get("constraints", []),
               comparison=d.get("comparison", "exact"), is_available=bool(d["test_cases"]))

    stubs_file = fixtures_dir / "unavailable-problems.json"
    for s in _load(stubs_file) if stubs_file.exists() else []:
        if s["id"] in wanted:
            continue
        upsert(s["id"], title=s["title"], description=PLACEHOLDER, difficulty=s["difficulty"], topic=s["topic"],
               starter_code="", function_signature={}, test_cases=[], examples=[], constraints=[],
               comparison="exact", is_available=False)
    db.flush()

    roadmaps = _load(fixtures_dir / "roadmaps.json")
    for i, r in enumerate(roadmaps):
        row = db.get(Roadmap, r["id"])
        if row is None:
            row = Roadmap(id=r["id"])
            db.add(row)
        row.title, row.description, row.difficulty, row.sort_order = r["title"], r["description"], r["difficulty"], i
        db.flush()
        db.query(RoadmapProblem).filter_by(roadmap_id=r["id"]).delete()
        seq = 0
        for topic in r["topics"]:
            for pid in topic["problems"]:
                if pid not in wanted:
                    raise ValueError(f"roadmap {r['id']} references unknown problem {pid}")
                seq += 1
                db.add(RoadmapProblem(roadmap_id=r["id"], problem_id=pid, topic=topic["name"], sequence_order=seq))
    db.commit()
    log.info("catalog seeded: %d problems, %d roadmaps", len(wanted), len(roadmaps))


if __name__ == "__main__":
    from app.core.config import get_settings
    from app.db.session import session_factory

    logging.basicConfig(level=logging.INFO)
    with session_factory()() as s:
        seed_catalog(s, get_settings().fixtures_dir)
