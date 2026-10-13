import pytest
from sqlalchemy import func, select

from app.api import learning
from app.models import ChatMessage
from app.services.tutor.llm import LLMError, LLMRequest, LLMResponse
from tests.test_sessions import open_session


class FakeLLM:
    mode = "live"

    def __init__(self, reply="What have you tried so far?", error: LLMError | None = None):
        self.reply, self.error, self.requests = reply, error, []

    def complete(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        if self.error:
            raise self.error
        return LLMResponse(text=self.reply, input_tokens=120, output_tokens=30)


@pytest.fixture()
def fake(app):
    f = FakeLLM()
    app.dependency_overrides[learning._provider] = lambda: f
    return f


def chat(c, h, sid, **kw):
    return c.post("/api/chat", json={"session_id": sid, **kw}, headers=h)


def test_saving_code_never_calls_llm(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    for i in range(3):
        c.put(f"/api/sessions/{sid}/code", json={"code": f"x = {i}"}, headers=h)
    assert fake.requests == []


def test_chat_syncs_unsaved_code_before_calling_llm(auth, fake):
    c, h = auth
    s = open_session(c, h)
    r = chat(c, h, s["id"], message="why slow?", code="def two_sum(nums, target):\n    return [9, 9]")
    assert r.status_code == 200, r.text
    assert r.json()["code_version"] == 2
    prompt = fake.requests[0].messages[-1]["content"]
    assert "return [9, 9]" in prompt and 'version="2"' in prompt  # tutor sees the unsaved code, not the starter
    assert c.get(f"/api/sessions/{s['id']}").json()["saved_code"].endswith("return [9, 9]")


def test_chat_without_code_uses_saved_version_and_persists_messages(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    c.put(f"/api/sessions/{sid}/code", json={"code": "saved = 1"}, headers=h)
    r = chat(c, h, sid, message="hello").json()
    assert r["code_version"] == 2 and r["tutor_mode"] == "live"
    assert r["user_message"]["content"] == "hello" and r["assistant_message"]["content"] == fake.reply
    assert "saved = 1" in fake.requests[0].messages[-1]["content"]
    msgs = c.get(f"/api/sessions/{sid}").json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"]  # survives a reload


def test_unchanged_code_in_chat_does_not_bump_version(auth, fake):
    c, h = auth
    s = open_session(c, h)
    r = chat(c, h, s["id"], message="hi", code=s["saved_code"]).json()
    assert r["code_version"] == 1


def test_history_is_limited_and_rolls_forward(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    for i in range(7):
        chat(c, h, sid, message=f"question {i}")
    last = fake.requests[-1]
    assert len(last.messages) == 8 + 1  # chat_history_limit(8) prior messages + current turn
    assert "omitted" in last.messages[-1]["content"]
    assert last.messages[0]["role"] == "user"
    assert "question 6" in last.messages[-1]["content"]


def test_hint_levels_escalate_on_request_and_cap_at_five(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    levels = [chat(c, h, sid, kind="hint").json()["hint_level"] for _ in range(7)]
    assert levels == [1, 2, 3, 4, 5, 5, 5]
    assert '<request kind="hint" level="1">' in fake.requests[0].messages[-1]["content"]
    chat(c, h, sid, message="a normal question")
    assert c.get(f"/api/sessions/{sid}").json()["hint_level"] == 5  # plain chat doesn't escalate
    stored = c.get(f"/api/sessions/{sid}").json()["messages"]
    assert stored[0]["content"] == "Request Hint" and stored[0]["kind"] == "hint"


def test_review_kind(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    r = chat(c, h, sid, kind="review").json()
    assert r["user_message"]["content"] == "Review My Approach" and r["hint_level"] == 0
    assert '<request kind="review">' in fake.requests[0].messages[-1]["content"]


def test_chat_includes_latest_test_results(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    total = len(c.get("/api/problems/two-sum").json()["test_cases"])
    c.post("/api/submissions", json={"session_id": sid, "passed_tests": 1, "total_tests": total, "execution_status": "failed",
                                     "failures": [{"test_id": 2, "input": "[3,2,4], 6", "expected": "[1, 2]", "actual": "None"}]}, headers=h)
    chat(c, h, sid, message="why failing?")
    assert "test 2" in fake.requests[0].messages[-1]["content"] and f"1/{total}" in fake.requests[0].messages[-1]["content"]


def test_roadmap_style_reaches_the_prompt(auth, fake):
    c, h = auth
    sid = open_session(c, h, roadmap="blind-75")["id"]
    chat(c, h, sid, message="hi")
    assert "interview" in fake.requests[0].system_context


def test_reference_solutions_are_never_in_the_prompt(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    chat(c, h, sid, message="hi")
    r = fake.requests[0]
    blob = r.system_stable + r.system_context + "".join(m["content"] for m in r.messages)
    assert "seen[target" not in blob and "hash map" not in blob.lower().replace("hash maps", "")


def test_llm_failure_returns_error_keeps_saved_code_and_stores_no_chat(auth, fake, db):
    c, h = auth
    s = open_session(c, h)
    fake.error = LLMError(503, "llm_unavailable", "Could not reach the AI tutor.")
    r = chat(c, h, s["id"], message="hello?", code="precious = 1", kind="chat")
    assert r.status_code == 503 and r.json()["error"]["code"] == "llm_unavailable"
    assert db.scalar(select(func.count()).select_from(ChatMessage)) == 0
    got = c.get(f"/api/sessions/{s['id']}").json()
    assert got["saved_code"] == "precious = 1" and got["hint_level"] == 0  # work is safe; hint wasn't consumed


def test_llm_rate_limit_passes_retry_after(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    fake.error = LLMError(429, "llm_rate_limited", "busy", retry_after=17)
    r = chat(c, h, sid, message="x")
    assert r.status_code == 429 and r.headers["retry-after"] == "17"


def test_failed_hint_does_not_consume_a_hint(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    fake.error = LLMError(503, "llm_unavailable", "down")
    chat(c, h, sid, kind="hint")
    fake.error = None
    assert chat(c, h, sid, kind="hint").json()["hint_level"] == 1


def test_leaking_reply_is_replaced(auth, fake):
    from evals.scenarios import LEAKING_REPLY
    c, h = auth
    sid = open_session(c, h)["id"]
    fake.reply = LEAKING_REPLY
    r = chat(c, h, sid, message="give me the answer").json()
    assert "def two_sum" not in r["assistant_message"]["content"]


@pytest.mark.parametrize("body", [{"message": "  "}, {}, {"message": "x" * 2001}, {"kind": "bogus"}, {"message": "hi", "extra": 1}])
def test_invalid_chat_requests(auth, fake, body):
    c, h = auth
    sid = open_session(c, h)["id"]
    assert chat(c, h, sid, **body).status_code == 422
    assert fake.requests == []


def test_chat_requires_auth_csrf_and_valid_session(auth, fake):
    c, h = auth
    sid = open_session(c, h)["id"]
    assert c.post("/api/chat", json={"session_id": sid, "message": "hi"}).status_code == 403
    assert chat(c, h, "00000000-0000-0000-0000-000000000000", message="hi").status_code == 404


def test_mock_mode_is_labelled(auth):
    c, h = auth  # no override -> real MockProvider via settings
    sid = open_session(c, h)["id"]
    r = chat(c, h, sid, message="hi").json()
    assert r["tutor_mode"] == "mock" and "not AI" in r["assistant_message"]["content"]
    assert c.get(f"/api/sessions/{sid}").json()["tutor_mode"] == "mock"
