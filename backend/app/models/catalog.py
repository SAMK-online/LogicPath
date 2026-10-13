from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

DIFFICULTIES = ("Beginner", "Intermediate", "Advanced")
PROBLEM_DIFFICULTIES = ("Easy", "Medium", "Hard")


class Roadmap(Base):
    __tablename__ = "roadmaps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    problems: Mapped[list[RoadmapProblem]] = relationship(
        back_populates="roadmap", order_by="RoadmapProblem.sequence_order", cascade="all, delete-orphan"
    )


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # slug, e.g. "two-sum"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(10))
    topic: Mapped[str] = mapped_column(String(120))
    starter_code: Mapped[str] = mapped_column(Text, default="")
    function_signature: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    test_cases: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    examples: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    constraints: Mapped[list[str]] = mapped_column(JSON, default=list)
    comparison: Mapped[str] = mapped_column(String(20), default="exact")
    # False for catalog entries whose statement and tests have not been authored yet.
    is_available: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        CheckConstraint("difficulty IN ('Easy','Medium','Hard')", name="difficulty_valid"),
        CheckConstraint("comparison IN ('exact','sorted')", name="comparison_valid"),
    )


class RoadmapProblem(Base):
    """A problem can sit in many roadmaps (and under a different topic in each) without duplicating the problem row."""

    __tablename__ = "roadmap_problems"

    roadmap_id: Mapped[str] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), primary_key=True)
    problem_id: Mapped[str] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True)
    topic: Mapped[str] = mapped_column(String(120))
    sequence_order: Mapped[int] = mapped_column(Integer)

    roadmap: Mapped[Roadmap] = relationship(back_populates="problems")
    problem: Mapped[Problem] = relationship()

    __table_args__ = (Index("ix_roadmap_problems_order", "roadmap_id", "sequence_order", unique=True),)
