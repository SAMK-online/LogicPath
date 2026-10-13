from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, conflict
from app.core.security import hash_password, hash_session_token, needs_rehash, new_session_token, verify_password
from app.models import AuthSession, User
from app.models._common import utcnow


def register_user(db: Session, *, name: str, email: str, password: str) -> User:
    if db.scalar(select(User.id).where(User.email == email)):
        raise conflict("email_taken", "An account with this email already exists")
    user = User(name=name, email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # lost a race with a concurrent registration
        db.rollback()
        raise conflict("email_taken", "An account with this email already exists") from None
    return user


def authenticate(db: Session, *, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    ok = verify_password(user.password_hash if user else None, password)
    if not user or not ok:
        # Same message for unknown email and wrong password.
        raise AppError(401, "invalid_credentials", "Incorrect email or password")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.commit()
    return user


def create_session(db: Session, user: User) -> str:
    """Returns the raw token for the cookie; only its HMAC is persisted."""
    now = utcnow()
    db.execute(delete(AuthSession).where(AuthSession.expires_at < now))  # opportunistic cleanup
    token = new_session_token()
    db.add(AuthSession(user_id=user.id, token_hash=hash_session_token(token),
                       expires_at=now + timedelta(hours=get_settings().session_ttl_hours)))
    db.commit()
    return token


def resolve_session(db: Session, token: str | None) -> tuple[User, AuthSession] | None:
    if not token:
        return None
    sess = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_session_token(token)))
    if sess is None:
        return None
    if sess.expires_at <= utcnow():
        db.delete(sess)
        db.commit()
        return None
    return sess.user, sess


def revoke_session(db: Session, sess: AuthSession) -> None:
    db.delete(sess)
    db.commit()
