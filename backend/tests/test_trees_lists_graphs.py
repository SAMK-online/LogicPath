"""The tree, linked-list and graph problems: independent solutions pass every test, and the harness handles linked lists."""
import json
from pathlib import Path

import pytest

from app.core.config import get_settings

HARNESS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "workers" / "harness.py"

SOLUTIONS = {
    "same-tree": "def is_same_tree(p, q):\n    stack = [(p, q)]\n    while stack:\n        a, b = stack.pop()\n        if a is None or b is None:\n            if a is not b:\n                return False\n            continue\n"
                 "        if a.val != b.val:\n            return False\n        stack.append((a.left, b.left))\n        stack.append((a.right, b.right))\n    return True\n",
    "binary-tree-level-order-traversal": "from collections import deque\n\ndef level_order(root):\n    out = []\n    q = deque([root] if root else [])\n    while q:\n        out.append([n.val for n in q])\n"
                                         "        for _ in range(len(q)):\n            n = q.popleft()\n            if n.left:\n                q.append(n.left)\n            if n.right:\n                q.append(n.right)\n    return out\n",
    "reverse-linked-list": "def reverse_list(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev\n",
    "merge-two-sorted-lists": "def merge_two_lists(list1, list2):\n    dummy = tail = ListNode()\n    while list1 and list2:\n        if list1.val <= list2.val:\n            tail.next, list1 = list1, list1.next\n        else:\n            tail.next, list2 = list2, list2.next\n        tail = tail.next\n"
                              "    tail.next = list1 or list2\n    return dummy.next\n",
}


@pytest.fixture(scope="module")
def h():
    ns: dict = {}
    exec(compile(HARNESS.read_text(), str(HARNESS), "exec"), ns)
    return ns


def problem(pid):
    return json.loads((get_settings().fixtures_dir / "problems" / f"{pid}.json").read_text())


def run(h, pid, code, tests=None):
    p = problem(pid)
    return json.loads(h["run_payload"](json.dumps({"code": code, "signature": p["function_signature"], "tests": tests or p["test_cases"], "comparison": p["comparison"]})))


def trace(h, pid, code, test):
    p = problem(pid)
    return json.loads(h["trace_payload"](json.dumps({"code": code, "signature": p["function_signature"], "test": test, "maxSteps": 500})))


@pytest.mark.parametrize("pid", sorted(SOLUTIONS))
def test_independent_solution_passes_every_test(h, pid):
    r = run(h, pid, SOLUTIONS[pid])
    assert r["status"] == "passed", [(c["id"], c["input"], c["expected"], c["actual"], c["error"]) for c in r["cases"] if not c["passed"]]


@pytest.mark.parametrize("pid", sorted(SOLUTIONS))
def test_the_starter_code_fails_but_runs(h, pid):
    r = run(h, pid, problem(pid)["starter_code"])
    assert r["status"] == "failed" and r["error"] is None


def test_new_problems_are_in_the_roadmaps():
    roadmaps = {r["id"]: r for r in json.loads((get_settings().fixtures_dir / "roadmaps.json").read_text())}
    dsa = {pid for t in roadmaps["dsa-fundamentals"]["topics"] for pid in t["problems"]}
    blind = {pid for t in roadmaps["blind-75"]["topics"] for pid in t["problems"]}
    new = set(SOLUTIONS) | {"number-of-connected-components-in-an-undirected-graph", "graph-valid-tree"}
    assert new <= dsa and new <= blind
    assert {t["name"] for t in roadmaps["dsa-fundamentals"]["topics"]} >= {"Linked lists", "Graphs"}


# ---- linked lists in the harness ------------------------------------------------------------------------------
def test_returning_something_that_is_not_a_list_node_is_explained(h):
    r = run(h, "reverse-linked-list", "def reverse_list(head):\n    return [1, 2]\n", [{"id": 1, "args": [[1, 2]], "expected": [2, 1]}])
    assert "ListNode" in r["cases"][0]["error"] and "list" in r["cases"][0]["error"]


def test_a_returned_list_that_loops_is_reported_not_hung(h):
    code = "def reverse_list(head):\n    if head:\n        head.next = head\n    return head\n"
    r = run(h, "reverse-linked-list", code, [{"id": 1, "args": [[1, 2]], "expected": [2, 1]}])
    assert "loops back" in r["cases"][0]["error"]


def test_trace_snapshots_a_linked_list_as_its_values(h):
    code = SOLUTIONS["reverse-linked-list"]
    t = trace(h, "reverse-linked-list", code, {"id": -1, "args": [[1, 2, 3]], "expected": None, "unchecked": True})
    assert t["status"] == "ok" and t["result"] == {"t": "list", "n": 3, "v": [3, 2, 1]}
    seen = [s["locals"]["head"] for s in t["steps"] if "head" in s["locals"]]
    assert seen[0] == {"t": "linked", "n": 3, "v": [1, 2, 3]}
    assert any(s["locals"].get("prev") == {"t": "linked", "n": 1, "v": [1]} for s in t["steps"])


def test_a_cyclic_list_is_marked_instead_of_looping(h):
    code = "def reverse_list(head):\n    head.next = head\n    snapshot = head\n    return None\n"
    t = trace(h, "reverse-linked-list", code, {"id": -1, "args": [[1, 2]], "expected": None, "unchecked": True})
    last = [s["locals"] for s in t["steps"] if "snapshot" in s["locals"]][-1]["snapshot"]
    assert last["t"] == "linked" and last["more"] is True and last["n"] == 1


# ---- graph generators ----------------------------------------------------------------------------------------
def test_graph_generators(h):
    tree = h["_expand"]({"$gen": "random_tree_edges", "n": 50, "seed": 3})
    assert len(tree) == 49 and all(a < b for a, b in tree)
    edges = h["_expand"]({"$gen": "random_edges", "n": 100, "m": 150, "seed": 4})
    assert len(edges) == 150 and len({(min(a, b), max(a, b)) for a, b in edges}) == 150 and all(a != b for a, b in edges)
    assert h["_expand"]({"$gen": "random_edges", "n": 100, "m": 150, "seed": 4}) == edges
