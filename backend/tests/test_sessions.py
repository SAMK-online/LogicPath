from tests.conftest import register


def open_session(c, h, problem="two-sum", roadmap="dsa-fundamentals"):
    r = c.post("/api/sessions", json={"problem_id": problem, "roadmap_id": roadmap}, headers=h)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_create_then_resume_same_session(auth):
    c, h = auth
    first = c.post("/api/sessions", json={"problem_id": "two-sum"}, headers=h)
    assert first.status_code == 201
    again = c.post("/api/sessions", json={"problem_id": "two-sum"}, headers=h)
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]
    s = first.json()
    assert s["code_version"] == 1 and "def two_sum" in s["saved_code"] and s["messages"] == []


def test_save_code_versions(auth):
    c, h = auth
    sid = open_session(c, h)["id"]
    r = c.put(f"/api/sessions/{sid}/code", json={"code": "x = 1"}, headers=h).json()
    assert r == {**r, "code_version": 2, "changed": True}
    same = c.put(f"/api/sessions/{sid}/code", json={"code": "x = 1"}, headers=h).json()
    assert same["code_version"] == 2 and same["changed"] is False  # unchanged -> no bump
    assert c.put(f"/api/sessions/{sid}/code", json={"code": "x = 2"}, headers=h).json()["code_version"] == 3
    got = c.get(f"/api/sessions/{sid}").json()
    assert got["saved_code"] == "x = 2" and got["code_version"] == 3


def test_save_requires_csrf_and_auth(auth, client):
    c, h = auth
    sid = open_session(c, h)["id"]
    assert c.put(f"/api/sessions/{sid}/code", json={"code": "x"}).status_code == 403
    c.cookies.clear()
    assert c.put(f"/api/sessions/{sid}/code", json={"code": "x"}, headers=h).status_code == 401


def test_other_users_cannot_read_or_write_a_session(client):
    a = register(client, email="a@example.com")
    ha = {"X-CSRF-Token": a["csrf_token"]}
    sid = open_session(client, ha)["id"]
    client.cookies.clear()
    b = register(client, email="b@example.com")
    hb = {"X-CSRF-Token": b["csrf_token"]}
    assert client.get(f"/api/sessions/{sid}").status_code == 404
    assert client.put(f"/api/sessions/{sid}/code", json={"code": "hacked"}, headers=hb).status_code == 404
    assert client.post("/api/chat", json={"session_id": sid, "message": "hi"}, headers=hb).status_code == 404
    body = {"session_id": sid, "passed_tests": 1, "total_tests": 6, "execution_status": "failed"}
    assert client.post("/api/submissions", json=body, headers=hb).status_code == 404
    # B opening the same problem gets their own session with starter code.
    mine = open_session(client, hb)
    assert mine["id"] != sid and "hacked" not in mine["saved_code"]


def test_client_cannot_supply_a_user_id(auth):
    c, h = auth
    r = c.post("/api/sessions", json={"problem_id": "two-sum", "user_id": "someone-else"}, headers=h)
    assert r.status_code == 422


def test_unavailable_problem_and_bad_roadmap(auth):
    c, h = auth
    assert c.post("/api/sessions", json={"problem_id": "best-time-to-buy-and-sell-stock"}, headers=h).status_code == 409
    assert c.post("/api/sessions", json={"problem_id": "nope"}, headers=h).status_code == 404
    assert c.post("/api/sessions", json={"problem_id": "binary-search", "roadmap_id": "blind-75"}, headers=h).status_code == 422
    assert c.post("/api/sessions", json={"problem_id": "two-sum", "roadmap_id": "ghost"}, headers=h).status_code == 404


def test_code_size_limit(auth):
    c, h = auth
    sid = open_session(c, h)["id"]
    assert c.put(f"/api/sessions/{sid}/code", json={"code": "x" * 20001}, headers=h).status_code == 422


def test_concurrent_first_open_returns_the_winners_session(auth, db):
    """Simulate losing the creation race: the pre-check sees nothing, the insert hits the unique constraint."""
    from unittest.mock import patch

    from sqlalchemy import select

    from app.models import User
    from app.services import sessions as svc

    c, h = auth
    winner = open_session(c, h)  # the "other request" already created it
    user = db.scalar(select(User))
    real_scalar, calls = db.scalar, {"n": 0}

    def racy_scalar(stmt, *a, **k):
        calls["n"] += 1
        return None if calls["n"] == 1 else real_scalar(stmt, *a, **k)  # first lookup is "stale"

    with patch.object(db, "scalar", side_effect=racy_scalar):
        cs, created = svc.get_or_create(db, user.id, "two-sum", None)
    assert cs.id == winner["id"] and created is False
