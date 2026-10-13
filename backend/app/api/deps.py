from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import forbidden, unauthorized
from app.core.security import constant_time_equals, csrf_token_for
from app.db.session import get_db
from app.models import AuthSession, User
from app.services import auth as auth_service

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class CurrentUser:
    user: User
    auth_session: AuthSession
    token: str


def current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    settings = get_settings()
    token = request.cookies.get(settings.cookie_name)
    resolved = auth_service.resolve_session(db, token)
    if resolved is None:
        raise unauthorized("Your session has expired. Please log in again.", code="session_invalid")
    user, sess = resolved
    assert token is not None
    if request.method not in SAFE_METHODS:
        supplied = request.headers.get("x-csrf-token", "")
        if not supplied or not constant_time_equals(supplied, csrf_token_for(token)):
            raise forbidden("Missing or invalid CSRF token", code="csrf_failed")
    return CurrentUser(user=user, auth_session=sess, token=token)


def set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name, token, max_age=s.session_ttl_hours * 3600, httponly=True,
        secure=s.cookie_secure, samesite=s.cookie_samesite, path="/",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(s.cookie_name, path="/", secure=s.cookie_secure, httponly=True, samesite=s.cookie_samesite)
