from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, current_user
from app.db.session import get_db
from app.schemas.catalog import ProblemListItem, ProblemOut, RoadmapDetail, RoadmapSummary
from app.services import catalog

router = APIRouter(tags=["catalog"])


@router.get("/roadmaps", response_model=list[RoadmapSummary])
def list_roadmaps(cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return catalog.list_roadmaps(db, cu.user.id)


@router.get("/roadmaps/{roadmap_id}", response_model=RoadmapDetail)
def get_roadmap(roadmap_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return catalog.get_roadmap(db, roadmap_id, cu.user.id)


@router.get("/problems", response_model=list[ProblemListItem])
def list_problems(roadmap_id: str | None = Query(default=None, max_length=64), _: CurrentUser = Depends(current_user),
                  db: Session = Depends(get_db)):
    return catalog.list_problems(db, roadmap_id=roadmap_id)


@router.get("/problems/{problem_id}", response_model=ProblemOut)
def get_problem(problem_id: str, _: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return catalog.get_problem(db, problem_id)
