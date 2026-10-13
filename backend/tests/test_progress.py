from tests.test_sessions import open_session


def sub(c, h, sid, passed, total, status, **kw):
    return c.post("/api/submissions", json={"session_id": sid, "passed_tests": passed, "total_tests": total,
                                            "execution_status": status, **kw}, headers=h)


def test_attempts_and_completion_flow(auth):
    c, h = auth
    sid = open_session(c, h)["id"]
    total = len(c.get("/api/problems/two-sum").json()["test_cases"])
    r = sub(c, h, sid, 2, total, "failed", code="def two_sum(nums, target):\n    return []", failures=[
        {"test_id": 3, "input": "[3, 3], 6", "expected": "[0, 1]", "actual": "[]"}])
    assert r.status_code == 201
    assert r.json()["completion_status"] == "in_progress" and r.json()["attempts"] == 1 and r.json()["code_version"] == 2

    done = sub(c, h, sid, total, total, "passed").json()
    assert done["completion_status"] == "completed" and done["attempts"] == 2
    # completion is sticky
    assert sub(c, h, sid, 0, total, "error").json()["completion_status"] == "completed"

    p = c.get("/api/progress").json()
    assert p["completed"] == 1 and p["recent"][0]["problem_id"] == "two-sum" and p["recent"][0]["roadmap_id"] == "dsa-fundamentals"
    rm = {x["id"]: x for x in c.get("/api/roadmaps").json()}
    assert rm["dsa-fundamentals"]["completed_problems"] == 1 and rm["blind-75"]["completed_problems"] == 1  # shared problem
    assert rm["python-foundations"]["completed_problems"] == 0
    detail = c.get("/api/roadmaps/dsa-fundamentals").json()
    two = next(p for t in detail["topics"] for p in t["problems"] if p["id"] == "two-sum")
    assert two["status"] == "completed"


def test_submission_validation(auth):
    c, h = auth
    sid = open_session(c, h)["id"]
    total = len(c.get("/api/problems/two-sum").json()["test_cases"])
    assert sub(c, h, sid, 5, 3, "failed").status_code == 422  # passed > total
    assert sub(c, h, sid, 1, total + 1, "failed").json()["error"]["code"] == "test_count_mismatch"
    assert sub(c, h, sid, 1, total, "passed").json()["error"]["code"] == "inconsistent_result"
    assert sub(c, h, sid, 1, total, "weird").status_code == 422
    assert sub(c, h, sid, 1, total, "failed", failures=[{"test_id": i, "input": "", "expected": ""} for i in range(6)]).status_code == 422


def test_save_does_not_count_as_attempt(auth):
    c, h = auth
    sid = open_session(c, h)["id"]
    c.put(f"/api/sessions/{sid}/code", json={"code": "x=1"}, headers=h)
    p = c.get("/api/progress").json()
    assert p["problems"][0]["attempts"] == 0 and p["problems"][0]["status"] == "in_progress"
