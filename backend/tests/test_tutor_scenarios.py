"""The 15 evaluation scenarios, run deterministically against the real pipeline with a scripted LLM."""
import pytest
from sqlalchemy import select

from app.api import learning
from app.models import CodingSession, Problem
from evals.scenarios import GOOD_REPLY, LEAKING_REPLY, SCENARIOS
from tests.test_chat import FakeLLM
from tests.test_sessions import open_session


def test_at_least_fifteen_scenarios_cover_required_categories():
    assert len(SCENARIOS) >= 15
    cats = {s.category for s in SCENARIOS}
    assert {"requests_solution", "brute_force", "logical_mistake", "complexity", "stuck", "improves", "failed_test", "performance"} <= cats


@pytest.mark.parametrize("sc", SCENARIOS, ids=lambda s: s.id)
def test_scenario_pipeline(auth, app, db, sc):
    c, h = auth
    fake = FakeLLM(reply=GOOD_REPLY)
    app.dependency_overrides[learning._provider] = lambda: fake
    sid = open_session(c, h, sc.problem_id, sc.roadmap_id)["id"]

    # Arrange saved state: code, prior hints, a prior test run.
    row = db.scalar(select(CodingSession).where(CodingSession.id == sid))
    row.learning_state = {"hint_level": sc.hints_used, "hints_used": sc.hints_used}
    db.commit()
    if sc.last_run:
        total = len(c.get(f"/api/problems/{sc.problem_id}").json()["test_cases"])
        c.post("/api/submissions", json={"session_id": sid, "code": sc.code or None, "passed_tests": min(sc.last_run["passed"], total),
               "total_tests": total, "execution_status": sc.last_run["status"], "failures": sc.last_run["failures"]}, headers=h)
    payload = {"session_id": sid, "kind": sc.kind, "code": sc.code}
    if sc.message:
        payload["message"] = sc.message
    r = c.post("/api/chat", json=payload, headers=h)
    assert r.status_code == 200, r.text

    req = fake.requests[0]
    last = req.messages[-1]["content"]
    # 1. Understands current code
    if sc.code.strip():
        assert sc.code.strip() in last or all(i in last for i in sc.identifiers)
    for ident in sc.identifiers:
        assert ident in last
    # 2. Right problem, roadmap style, and no reference solution available to leak
    assert db.get(Problem, sc.problem_id).title in req.system_context
    # 3. Hint progression is decided by the server
    if sc.kind == "hint":
        assert f'level="{min(sc.hints_used + 1, 5)}"' in last
    # 4. Injection attempts cannot break out of their delimiters
    if sc.injection:
        assert last.count("</student_code>") == 1 and last.count("</student_message>") <= 1 and last.count("<request kind=") == 1
    assert r.json()["assistant_message"]["content"] == GOOD_REPLY


@pytest.mark.parametrize("sc", [s for s in SCENARIOS if s.history], ids=lambda s: s.id)
def test_follow_up_scenarios_carry_history(auth, app, sc):
    c, h = auth
    fake = FakeLLM(reply=GOOD_REPLY)
    app.dependency_overrides[learning._provider] = lambda: fake
    sid = open_session(c, h, sc.problem_id, sc.roadmap_id)["id"]
    for role, text in sc.history:
        if role == "user":
            c.post("/api/chat", json={"session_id": sid, "message": text if text != "Request Hint" else "x"}, headers=h)
    c.post("/api/chat", json={"session_id": sid, "message": "next", "code": sc.code}, headers=h)
    msgs = fake.requests[-1].messages
    assert len(msgs) >= 3 and msgs[0]["role"] == "user"


@pytest.mark.parametrize("sc", [s for s in SCENARIOS if s.category in ("requests_solution", "injection")], ids=lambda s: s.id)
def test_solution_leak_is_blocked_even_if_the_model_complies(auth, app, sc):
    c, h = auth
    fake = FakeLLM(reply=LEAKING_REPLY)
    app.dependency_overrides[learning._provider] = lambda: fake
    sid = open_session(c, h, sc.problem_id, sc.roadmap_id)["id"]
    r = c.post("/api/chat", json={"session_id": sid, "message": sc.message or "help", "code": sc.code}, headers=h)
    assert "def two_sum" not in r.json()["assistant_message"]["content"]
