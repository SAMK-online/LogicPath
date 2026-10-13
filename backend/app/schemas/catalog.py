from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

Status = Literal["not_started", "in_progress", "completed"]


class RoadmapSummary(BaseModel):
    id: str
    title: str
    description: str
    difficulty: str
    total_problems: int
    available_problems: int
    completed_problems: int
    progress_percent: int
    next_problem_id: str | None  # first unfinished, available problem: powers "Continue Learning"


class ProblemRef(BaseModel):
    id: str
    title: str
    difficulty: str
    is_available: bool
    status: Status


class TopicOut(BaseModel):
    name: str
    completed: int
    total: int
    problems: list[ProblemRef]


class RoadmapDetail(BaseModel):
    id: str
    title: str
    description: str
    difficulty: str
    total_problems: int
    available_problems: int
    completed_problems: int
    progress_percent: int
    next_problem_id: str | None
    topics: list[TopicOut]


class ProblemListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    difficulty: str
    topic: str
    is_available: bool


class ProblemOut(BaseModel):
    """Test cases are intentionally included: the browser runs them, so they are public in the MVP."""

    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    description: str
    difficulty: str
    topic: str
    starter_code: str
    function_signature: dict[str, Any]
    examples: list[dict[str, Any]]
    constraints: list[str]
    comparison: str
    is_available: bool
    test_cases: list[dict[str, Any]]
