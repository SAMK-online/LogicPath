import json

from app.core.config import get_settings


def test_requires_auth(client):
    for path in ("/api/roadmaps", "/api/roadmaps/blind-75", "/api/problems", "/api/problems/two-sum", "/api/progress"):
        assert client.get(path).status_code == 401, path


def test_three_roadmaps(auth):
    c, _ = auth
    r = c.get("/api/roadmaps").json()
    assert [x["id"] for x in r] == ["python-foundations", "dsa-fundamentals", "blind-75"]
    assert all(x["progress_percent"] == 0 and x["next_problem_id"] for x in r)


def test_blind75_structure_is_complete(auth):
    c, _ = auth
    d = c.get("/api/roadmaps/blind-75").json()
    assert d["total_problems"] == 75
    names = [t["name"] for t in d["topics"]]
    assert names == ["Array", "Binary", "Dynamic Programming", "Graph", "Interval", "Linked List", "Matrix", "String", "Tree", "Heap"]
    titles = {p["title"] for t in d["topics"] for p in t["problems"]}
    assert {"Two Sum", "Valid Parentheses", "Merge k Sorted Lists", "Word Search II"} <= titles
    assert 0 < d["available_problems"] < 75  # only authored problems are playable


def test_problem_in_multiple_roadmaps_is_one_record(auth):
    c, _ = auth
    ids = lambda rid: {p["id"] for t in c.get(f"/api/roadmaps/{rid}").json()["topics"] for p in t["problems"]}
    assert "two-sum" in ids("dsa-fundamentals") & ids("blind-75")
    assert len([p for p in c.get("/api/problems").json() if p["id"] == "two-sum"]) == 1


def test_problem_detail_has_what_the_workspace_needs(auth):
    c, _ = auth
    p = c.get("/api/problems/two-sum").json()
    assert p["function_signature"]["name"] == "two_sum"
    assert "def two_sum" in p["starter_code"]
    assert p["examples"] and p["constraints"] and len(p["test_cases"]) >= 3
    assert {"id", "args", "expected"} <= set(p["test_cases"][0])


def test_unknown_problem_and_roadmap(auth):
    c, _ = auth
    assert c.get("/api/problems/nope").status_code == 404
    assert c.get("/api/roadmaps/nope").status_code == 404


def test_fixture_integrity():
    root = get_settings().fixtures_dir
    problems = {}
    for f in (root / "problems").glob("*.json"):
        d = json.loads(f.read_text())
        problems[d["id"]] = d
        name = d["function_signature"]["name"]
        assert f"def {name}(" in d["starter_code"], d["id"]
        assert len(d["test_cases"]) >= 3 and all(len(t["args"]) == len(d["function_signature"]["params"]) for t in d["test_cases"]), d["id"]
        assert "return" not in d["starter_code"], d["id"]  # starter code must not hand over an implementation
    for rm in json.loads((root / "roadmaps.json").read_text()):
        for t in rm["topics"]:
            assert t["problems"], f"empty topic {rm['id']}/{t['name']}"
    assert {"two-sum", "valid-parentheses", "binary-search"} <= set(problems)
