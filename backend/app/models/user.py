from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._common import new_id, utcnow
from app.models.types import UTCDateTime


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(320), unique=True)  # stored lowercased
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    auth_sessions: Mapped[list[AuthSession]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)  # HMAC-SHA256 of the cookie token
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="auth_sessions")

    __table_args__ = (Index("ix_auth_sessions_expires_at", "expires_at"),)
