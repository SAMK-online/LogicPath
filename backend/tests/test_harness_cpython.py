"""The browser harness is plain Python (frontend/src/workers/harness.py). Here it runs under real CPython against the fixtures."""
import builtins
import json
from pathlib import Path

import pytest

from app.core.config import get_settings

HARNESS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "workers" / "harness.py"


@pytest.fixture(scope="module")
def h():
    ns: dict = {}
    exec(compile(HARNESS.read_text(), str(HARNESS), "exec"), ns)
    return ns


def problem(pid):
    return json.loads((get_settings().fixtures_dir / "problems" / f"{pid}.json").read_text())


def run(h, pid, code):
    p = problem(pid)
    return json.loads(h["run_payload"](json.dumps({"code": code, "signature": p["function_signature"], "tests": p["test_cases"], "comparison": p["comparison"]})))


def trace(h, pid, code, test_index=0, max_steps=500):
    p = problem(pid)
    payload = {"code": code, "signature": p["function_signature"], "test": p["test_cases"][test_index], "maxSteps": max_steps}
    return json.loads(h["trace_payload"](json.dumps(payload)))


TWO_SUM = "def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n"
BINARY = ("def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n"
          "        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n")


# ---- run ------------------------------------------------------------------
def test_run_pass_fail_and_errors(h):
    assert run(h, "two-sum", TWO_SUM)["status"] == "passed"
    assert run(h, "two-sum", "def two_sum(nums, target):\n    return []")["status"] == "failed"
    assert "SyntaxError" in run(h, "two-sum", "def two_sum(nums target):")["error"]
    assert "Missing function" in run(h, "two-sum", "x = 1")["error"]
    r = run(h, "two-sum", "def two_sum(nums, target):\n    return 1/0")
    assert r["status"] == "failed" and "ZeroDivisionError" in r["cases"][0]["error"] and "line 2" in r["cases"][0]["error"]


def test_run_is_strict_about_bools_and_handles_trees(h):
    assert run(h, "leap-year", "def is_leap_year(year):\n    return 1")["status"] == "failed"
    # Iterative solutions: a recursive one is (deliberately) stopped by the 2,000-level performance test, see test_performance_fixtures.py
    tree = ("def max_depth(root):\n    depth, level = 0, [root] if root else []\n    while level:\n        depth += 1\n"
            "        level = [c for n in level for c in (n.left, n.right) if c]\n    return depth")
    assert run(h, "maximum-depth-of-binary-tree", tree)["status"] == "passed"
    inv = ("def invert_tree(root):\n    stack = [root] if root else []\n    while stack:\n        n = stack.pop()\n        n.left, n.right = n.right, n.left\n"
           "        stack += [c for c in (n.left, n.right) if c]\n    return root")
    assert run(h, "invert-binary-tree", inv)["status"] == "passed"
    recursive = "def max_depth(root):\n    return 0 if not root else 1 + max(max_depth(root.left), max_depth(root.right))"
    r = run(h, "maximum-depth-of-binary-tree", recursive)
    assert r["status"] == "failed" and all(c["passed"] for c in r["cases"] if not c["perf"])  # fine on ordinary tests, not on the deep one


def test_runs_do_not_share_state_or_poison_builtins(h):
    run(h, "two-sum", "import builtins\nbuiltins.len = lambda x: 0\nCOUNTER = 1\ndef two_sum(nums, target):\n    return []")
    assert builtins.len([1, 2]) == 2  # restored
    r = run(h, "two-sum", "def two_sum(nums, target):\n    return [COUNTER]")  # COUNTER from the previous run must not exist
    assert "NameError" in r["cases"][0]["error"]


# ---- trace ----------------------------------------------------------------
def test_trace_loop_with_pointers(h):
    t = trace(h, "binary-search", BINARY, test_index=0)  # [-1,0,3,5,9,12], target 9
    assert t["status"] == "ok" and t["error"] is None and not t["truncated"]
    assert t["result"] == 4 and t["expected"] == 4
    assert t["args"] == ["nums", "target"]
    first = t["steps"][0]
    assert first["event"] == "call" and first["locals"]["target"] == 9 and first["locals"]["nums"]["t"] == "list"
    lines = [s for s in t["steps"] if s["event"] == "line"]
    assert any("mid" in s["locals"] for s in lines) and {s["locals"].get("lo") for s in lines} >= {0, 3}
    assert t["steps"][-1]["event"] == "return" and t["steps"][-1]["ret"] == 4
    assert all(s["line"] >= 1 for s in t["steps"])


def test_trace_hash_map_snapshot_and_early_return(h):
    t = trace(h, "two-sum", TWO_SUM, test_index=0)
    assert t["result"] == {"t": "list", "n": 2, "v": [0, 1]}
    seen = [s["locals"].get("seen") for s in t["steps"] if "seen" in s["locals"]][-1]
    assert seen["t"] == "dict" and seen["v"] == [[2, 0]]
    assert t["steps"][-1]["event"] == "return"


def test_trace_recursion_tracks_depth(h):
    code = "def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n"
    t = trace(h, "fibonacci-number", code, test_index=3)  # n=4
    assert t["result"] == 3 and max(s["depth"] for s in t["steps"]) >= 4
    assert sum(s["event"] == "call" for s in t["steps"]) == sum(s["event"] == "return" for s in t["steps"])


def test_trace_tree_input_and_output(h):
    code = "def invert_tree(root):\n    if root:\n        root.left, root.right = invert_tree(root.right), invert_tree(root.left)\n    return root"
    t = trace(h, "invert-binary-tree", code, test_index=1)  # [2,1,3]
    assert t["steps"][0]["locals"]["root"] == {"t": "tree", "v": [2, 1, 3]}
    assert t["result"] == {"t": "list", "n": 3, "v": [2, 3, 1]}


def test_trace_keeps_the_steps_up_to_an_exception(h):
    code = "def two_sum(nums, target):\n    total = 0\n    for x in nums:\n        total += x\n    return total / 0\n"
    t = trace(h, "two-sum", code)
    assert t["status"] == "ok" and "ZeroDivisionError" in t["error"] and "line 5" in t["error"]
    assert any(s["event"] == "exception" and "ZeroDivisionError" in s["exc"] for s in t["steps"])
    assert t["steps"][2]["locals"]["total"] == 0


def test_trace_infinite_loop_is_truncated_not_hung(h):
    t = trace(h, "two-sum", "def two_sum(nums, target):\n    while True:\n        pass\n", max_steps=200)
    assert t["truncated"] is True and len(t["steps"]) == 200 and "Trace stopped" in t["error"]


def test_trace_compile_errors_and_missing_function(h):
    assert "SyntaxError" in trace(h, "two-sum", "def two_sum(nums target):")["error"]
    t = trace(h, "two-sum", "x = 1")
    assert t["status"] == "error" and "Missing function" in t["error"] and t["steps"] == []


def test_trace_snapshots_are_bounded_and_json_safe(h):
    big = "def two_sum(nums, target):\n    big = list(range(100000))\n    text = 'x' * 10000\n    d = dict.fromkeys(range(500), 0)\n    return [0, 1]\n"
    t = trace(h, "two-sum", big)
    last_line = [s for s in t["steps"] if s["event"] == "line"][-1]["locals"]
    assert len(last_line["big"]["v"]) == 50 and last_line["big"]["n"] == 100000
    assert len(last_line["text"]) <= 83 and len(last_line["d"]["v"]) == 50
    assert len(json.dumps(t)) < 400_000


def test_trace_captures_stdout_and_restores_state(h):
    t = trace(h, "two-sum", "import builtins\ndef two_sum(nums, target):\n    print('hello')\n    builtins.len = None\n    return [0, 1]\n")
    assert "hello" in t["stdout"] and builtins.len is not None
    import sys
    assert sys.gettrace() is None


# ---- a student's own experiments (no expected answer) ----------------------------
def test_unchecked_case_shows_the_output_and_judges_nothing(h):
    p = problem("two-sum")
    tests = [{"id": -1, "args": [[3, 3], 6], "expected": None, "unchecked": True}]
    res = json.loads(h["run_payload"](json.dumps({"code": TWO_SUM, "signature": p["function_signature"], "tests": tests, "comparison": p["comparison"]})))
    case = res["cases"][0]
    assert case["actual"] == "[0, 1]" and case["passed"] is True and case["error"] is None and case["expected"] == ""


def test_unchecked_case_still_reports_errors(h):
    p = problem("two-sum")
    tests = [{"id": -1, "args": [[1], 2], "expected": None, "unchecked": True}]
    res = json.loads(h["run_payload"](json.dumps({"code": "def two_sum(nums, target):\n    return nums[5]\n", "signature": p["function_signature"], "tests": tests, "comparison": "exact"})))
    assert "IndexError" in res["cases"][0]["error"] and res["cases"][0]["passed"] is False
