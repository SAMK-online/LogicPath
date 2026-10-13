from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._common import new_id, utcnow
from app.models.types import UTCDateTime


class CodingSession(Base):
    """One workspace per (user, problem). Resuming = loading this row."""

    __tablename__ = "coding_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    problem_id: Mapped[str] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"))
    roadmap_id: Mapped[str | None] = mapped_column(ForeignKey("roadmaps.id", ondelete="SET NULL"), nullable=True)
    saved_code: Mapped[str] = mapped_column(Text)
    code_version: Mapped[int] = mapped_column(Integer, default=1)
    # Compact tutor state: {"hint_level": 0-5, "hints_used": n}. Kept small on purpose.
    learning_state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="coding_session", order_by="ChatMessage.id", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("user_id", "problem_id", name="uq_coding_sessions_user_problem"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    coding_session_id: Mapped[str] = mapped_column(ForeignKey("coding_sessions.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(12))
    kind: Mapped[str] = mapped_column(String(12), default="chat")  # chat | hint | review
    content: Mapped[str] = mapped_column(Text)
    code_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    coding_session: Mapped[CodingSession] = relationship(back_populates="messages")

    __table_args__ = (
        CheckConstraint("role IN ('user','assistant')", name="role_valid"),
        CheckConstraint("kind IN ('chat','hint','review')", name="kind_valid"),
        Index("ix_chat_messages_session", "coding_session_id", "id"),
    )


class Submission(Base):
    """A client-reported test run. Analytics only; browser execution is not tamper-proof."""

    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    coding_session_id: Mapped[str] = mapped_column(ForeignKey("coding_sessions.id", ondelete="CASCADE"))
    code_version: Mapped[int] = mapped_column(Integer)
    passed_tests: Mapped[int] = mapped_column(Integer)
    total_tests: Mapped[int] = mapped_column(Integer)
    execution_status: Mapped[str] = mapped_column(String(12))  # passed | failed | error | timeout
    failures: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)  # truncated, used as tutor context
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (
        CheckConstraint("passed_tests >= 0 AND passed_tests <= total_tests", name="counts_valid"),
        CheckConstraint("execution_status IN ('passed','failed','error','timeout')", name="status_valid"),
        Index("ix_submissions_session", "coding_session_id", "id"),
    )


class UserProgress(Base):
    __tablename__ = "user_progress"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    problem_id: Mapped[str] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True)
    completion_status: Mapped[str] = mapped_column(String(16), default="not_started")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_attempted_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    __table_args__ = (
        CheckConstraint("completion_status IN ('not_started','in_progress','completed')", name="status_valid"),
        Index("ix_user_progress_recent", "user_id", "last_attempted_at"),
    )


class Visualization(Base):
    """Cached AI visualization spec. The trace is deterministic for (code version, test case), so one LLM call serves repeats."""

    __tablename__ = "visualizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    coding_session_id: Mapped[str] = mapped_column(ForeignKey("coding_sessions.id", ondelete="CASCADE"))
    code_version: Mapped[int] = mapped_column(Integer)
    test_case_id: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(8))  # live | mock: a mock spec must never be served as a real one
    spec: Mapped[dict[str, Any]] = mapped_column(JSON)
    captions_removed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    __table_args__ = (UniqueConstraint("coding_session_id", "code_version", "test_case_id", "mode", name="uq_visualizations_key"),)
