from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()  # argon2id with library defaults (RFC 9106 low-memory profile)
# Verified against when the email is unknown so login timing doesn't reveal which emails exist.
_DUMMY_HASH = _hasher.hash("timing-equalisation-only")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def _hmac(purpose: str, value: str) -> str:
    key = get_settings().session_secret.encode()
    return hmac.new(key, f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()


def hash_session_token(token: str) -> str:
    """What we store: a leaked database alone can't be used to impersonate users."""
    return _hmac("session", token)


def csrf_token_for(session_token: str) -> str:
    """Stateless CSRF token bound to the session; rotates with every login."""
    return _hmac("csrf", session_token)


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
