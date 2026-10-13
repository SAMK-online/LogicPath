from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.models import AuthSession, User
from app.models._common import utcnow
from tests.conftest import ORIGIN, register

PW = "correct-horse-battery"


def body(**kw):
    d = {"name": "Ada", "email": "ada@example.com", "password": PW, "confirm_password": PW}
    d.update(kw)
    return d


def test_register_sets_httponly_cookie_and_hashes_password(client, db):
    r = client.post("/api/auth/register", json=body())
    assert r.status_code == 201
    j = r.json()
    assert j["user"]["email"] == "ada@example.com" and j["csrf_token"]
    assert "password" not in r.text and "hash" not in r.text
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    user = db.scalar(select(User))
    assert user.password_hash.startswith("$argon2") and PW not in user.password_hash


def test_session_token_is_stored_hashed(client, db):
    register(client)
    raw = client.cookies.get(get_settings().cookie_name)
    stored = db.scalar(select(AuthSession))
    assert raw and stored.token_hash != raw and len(stored.token_hash) == 64


def test_email_is_normalised_and_unique(client):
    register(client, email="Ada@Example.com")
    r = client.post("/api/auth/register", json=body(email="ADA@example.com"))
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


@pytest.mark.parametrize("override", [
    {"password": "short", "confirm_password": "short"},
    {"confirm_password": "different-password-1"},
    {"email": "not-an-email"},
    {"name": "   "},
    {"extra": "field"},
])
def test_register_validation(client, override):
    r = client.post("/api/auth/register", json=body(**override))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert PW not in r.text  # never echo submitted passwords


def test_login_success_and_failures(client):
    register(client)
    client.cookies.clear()
    ok = client.post("/api/auth/login", json={"email": "ada@example.com", "password": PW})
    assert ok.status_code == 200 and client.get("/api/auth/me").status_code == 200
    client.cookies.clear()
    bad_pw = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-password-x"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PW})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()  # no account enumeration
    assert client.get("/api/auth/me").status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_invalid"


def test_logout_invalidates_session(auth):
    c, h = auth
    stale_cookie = c.cookies.get(get_settings().cookie_name)
    assert c.post("/api/auth/logout", headers=h).status_code == 204
    assert c.get("/api/auth/me").status_code == 401
    c.cookies.set(get_settings().cookie_name, stale_cookie)  # replaying the old cookie must not work
    assert c.get("/api/auth/me").status_code == 401


def test_csrf_required_for_state_changes(auth):
    c, h = auth
    assert c.post("/api/auth/logout").status_code == 403
    r = c.post("/api/auth/logout", headers={"X-CSRF-Token": "forged"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    assert c.get("/api/auth/me").status_code == 200  # still logged in


def test_csrf_token_is_bound_to_session(client):
    a = register(client, email="a@example.com")
    client.cookies.clear()
    b = register(client, email="b@example.com")
    assert a["csrf_token"] != b["csrf_token"]
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": a["csrf_token"]}).status_code == 403


def test_expired_session_is_rejected_and_removed(auth, db):
    c, _ = auth
    s = db.scalar(select(AuthSession))
    s.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    r = c.get("/api/auth/me")
    assert r.status_code == 401
    db.expire_all()
    assert db.scalar(select(AuthSession)) is None


def test_cross_origin_unsafe_request_rejected(client):
    r = client.post("/api/auth/login", json={"email": "a@b.co", "password": "x"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "origin_not_allowed"


def test_cors_only_allows_configured_origin(client):
    ok = client.options("/api/auth/me", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == ORIGIN
    bad = client.options("/api/auth/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_auth_rate_limit(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "rate_limit_enabled", True)
    monkeypatch.setattr(s, "auth_rate_limit", "3/60")
    codes = [client.post("/api/auth/login", json={"email": "x@example.com", "password": "nope-nope-nope"}).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]
    assert client.post("/api/auth/login", json={"email": "x@example.com", "password": "nope"}).headers["retry-after"]


def test_unknown_route_uses_error_envelope(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
