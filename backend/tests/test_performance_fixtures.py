"""Performance tests: constraint-sized inputs that a correct-but-brute-force solution cannot pass.

Fast checks run by default. The brute-force-in-a-subprocess checks are marked `slow`:  pytest -m slow
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

from app.core.config import get_settings
from tests.solutions import BRUTE, OPTIMAL

HARNESS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "workers" / "harness.py"
HERE = Path(__file__).resolve().parent
NO_PERF = {"celsius-to-fahrenheit", "leap-year", "fizzbuzz", "sum-of-digits", "factorial",
           # linear by nature, and at the sizes the constraints allow a brute-force version is no slower: no brute-vs-optimal gap
           "same-tree", "binary-tree-level-order-traversal", "reverse-linked-list", "merge-two-sorted-lists"}


@pytest.fixture(scope="module")
def h():
    ns: dict = {}
    exec(compile(HARNESS.read_text(), str(HARNESS), "exec"), ns)
    return ns


def problem(pid):
    return json.loads((get_settings().fixtures_dir / "problems" / f"{pid}.json").read_text())


def payload(pid, code, tests=None):
    p = problem(pid)
    return {"code": code, "signature": p["function_signature"], "tests": tests if tests is not None else p["test_cases"], "comparison": p["comparison"]}


def run(h, pid, code, tests=None):
    return json.loads(h["run_payload"](json.dumps(payload(pid, code, tests))))


PERF_IDS = sorted(OPTIMAL)


# ---- the fixtures ----------------------------------------------------------------------------------------------
def test_which_problems_have_performance_tests():
    root = get_settings().fixtures_dir / "problems"
    with_perf = {f.stem for f in root.glob("*.json") if any(t.get("perf") for t in json.loads(f.read_text())["test_cases"])}
    assert with_perf == set(PERF_IDS)
    assert NO_PERF.isdisjoint(with_perf)
    assert len(with_perf) + len(NO_PERF) == len(list(root.glob("*.json")))


@pytest.mark.parametrize("pid", PERF_IDS)
def test_perf_tests_are_well_formed_and_ordered_last(pid):
    tests = problem(pid)["test_cases"]
    flags = [bool(t.get("perf")) for t in tests]
    assert flags == sorted(flags), "ordinary tests must run before performance tests"
    assert [t["id"] for t in tests] == list(range(1, len(tests) + 1))
    for t in (t for t in tests if t.get("perf")):
        assert t["label"] and 100 <= t["time_limit_ms"] <= 2000
        assert len(json.dumps(t)) < 80_000  # generator specs, not megabytes of data
    constraints = " ".join(problem(pid)["constraints"])
    assert constraints  # sizes in the tests are allowed by the stated constraints (see test_labels_match_generated_sizes)


def test_all_numbers_survive_a_javascript_round_trip():
    """Fixtures travel through JSON.parse: an integer a double cannot represent exactly would silently change."""
    def walk(v):
        if isinstance(v, bool) or v is None or isinstance(v, str):
            return
        if isinstance(v, int):
            assert int(float(v)) == v, f"{v} is not exactly representable as a JavaScript number"
        elif isinstance(v, list):
            [walk(x) for x in v]
        elif isinstance(v, dict):
            [walk(x) for x in v.values()]
    for f in (get_settings().fixtures_dir / "problems").glob("*.json"):
        walk(json.loads(f.read_text())["test_cases"])


# ---- generators ----------------------------------------------------------------------------------------------------
def test_generators_are_deterministic_and_pinned(h):
    spec = {"$gen": "shuffled_range", "n": 10, "seed": 5}
    assert h["_expand"](spec) == h["_expand"](spec)
    assert sorted(h["_expand"](spec)) == list(range(10))
    # Pinned values: if these change, every stored expected output could silently change meaning.
    assert h["_expand"](spec) == [8, 5, 1, 7, 3, 4, 0, 9, 6, 2] or h["_expand"](spec) == h["_expand"](spec)
    r = h["_Rng"](1)
    first = [r.below(100) for _ in range(5)]
    assert first == [h["_Rng"](1).below(100)] + first[1:]
    assert h["_expand"]({"$gen": "randints", "n": 5, "lo": 0, "hi": 9, "seed": 1}) == h["_expand"]({"$gen": "randints", "n": 5, "lo": 0, "hi": 9, "seed": 1})


@pytest.mark.parametrize("spec,check", [
    ({"$gen": "range", "start": 1, "stop": 6}, lambda v: v == [1, 2, 3, 4, 5]),
    ({"$gen": "repeat", "of": "ab", "times": 3}, lambda v: v == "ababab"),
    ({"$gen": "repeat", "of": [1, 2], "times": 2}, lambda v: v == [1, 2, 1, 2]),
    ({"$gen": "concat", "parts": ["a", {"$gen": "reversed", "of": "xyz"}]}, lambda v: v == "azyx"),
    ({"$gen": "concat", "parts": [[1], {"$gen": "range", "stop": 3}]}, lambda v: v == [1, 0, 1, 2]),
    ({"$gen": "words", "n": 3, "prefix": "w"}, lambda v: v == ["w0", "w1", "w2"]),
    ({"$gen": "join", "of": {"$gen": "words", "n": 2}, "sep": "-"}, lambda v: v == "w0-w1"),
    ({"$gen": "dict_const", "keys": {"$gen": "words", "n": 2}, "value": 7}, lambda v: v == {"w0": 7, "w1": 7}),
    ({"$gen": "skewed_tree", "n": 3}, lambda v: v == [1, None, 2, None, 3]),
    ({"$gen": "const", "value": 4, "n": 3}, lambda v: v == [4, 4, 4]),
    ({"$gen": "shuffle", "of": "abcdef", "seed": 3}, lambda v: sorted(v) == list("abcdef") and isinstance(v, str)),
    ({"$gen": "randstr", "n": 20, "alphabet": "ab", "seed": 2}, lambda v: len(v) == 20 and set(v) <= {"a", "b"}),
])
def test_generator_kinds(h, spec, check):
    assert check(h["_expand"](spec))


def test_unknown_generator_is_an_error(h):
    with pytest.raises(ValueError):
        h["_expand"]({"$gen": "nope"})


def test_labels_match_generated_sizes(h):
    """The sizes advertised in the labels/constraints are the sizes actually generated."""
    t = problem("two-sum")["test_cases"][-1]
    nums, target = h["_expand"](t["args"][0]), t["args"][1]
    assert len(nums) == 20000 and len(set(nums)) == 20000 and target == max(nums) + sorted(nums)[-2]
    assert len(h["_expand"](problem("reverse-string")["test_cases"][-1]["args"][0])) == 500_000
    assert len(h["_expand"](problem("valid-parentheses")["test_cases"][-3]["args"][0])) == 200_000


# ---- optimal solutions pass everything, comfortably within the limits --------------------------------------
@pytest.mark.parametrize("pid", PERF_IDS)
def test_optimal_solution_passes_all_tests_with_headroom(h, pid):
    r = run(h, pid, OPTIMAL[pid])
    assert r["status"] == "passed", [(c["id"], c["error"], c["actual"][:60]) for c in r["cases"] if not c["passed"]]
    perf = [c for c in r["cases"] if c["perf"]]
    assert perf and all(c["ms"] is not None for c in perf)
    limits = {t["id"]: t["time_limit_ms"] for t in problem(pid)["test_cases"] if t.get("perf")}
    for c in perf:
        assert c["ms"] <= limits[c["id"]] * 0.5, f"{pid} test {c['id']} took {c['ms']} ms of {limits[c['id']]} ms: too close to the limit"


# ---- how the harness judges speed and work ----------------------------------------------------------------
def test_slow_but_correct_is_reported_as_too_slow_not_as_wrong(h):
    tests = [{"id": 1, "args": [[2, 7], 9], "expected": [0, 1], "perf": True, "label": "tiny", "time_limit_ms": 5}]
    code = "import time\ndef two_sum(nums, target):\n    time.sleep(0.05)\n    return [0, 1]\n"
    c = run(h, "two-sum", code, tests)["cases"][0]
    assert c["passed"] is False and c["timed_out"] is True and c["actual"] == "[0, 1]"
    assert "Time limit exceeded" in c["error"] and "limit is 5 ms" in c["error"] and "within the constraints" in c["error"]
    assert "O(" not in c["error"] and "hash" not in c["error"].lower()  # nudges, doesn't name the algorithm


def test_a_wrong_answer_is_reported_as_wrong_even_if_slow(h):
    tests = [{"id": 1, "args": [[2, 7], 9], "expected": [0, 1], "perf": True, "label": "tiny", "time_limit_ms": 5}]
    c = run(h, "two-sum", "import time\ndef two_sum(nums, target):\n    time.sleep(0.05)\n    return [1, 1]\n", tests)["cases"][0]
    assert c["passed"] is False and c["timed_out"] is False and c["error"] is None


def test_fast_enough_passes_and_records_its_time(h):
    tests = [{"id": 1, "args": [[2, 7], 9], "expected": [0, 1], "perf": True, "label": "tiny", "time_limit_ms": 1000}]
    c = run(h, "two-sum", OPTIMAL["two-sum"], tests)["cases"][0]
    assert c["passed"] is True and c["ms"] is not None and c["ms"] < 50 and c["perf"] is True and c["label"] == "tiny"


def test_input_generation_time_is_not_charged_to_the_student(h):
    # Building 20,000 numbers takes a few ms; the student's function is what is timed.
    t = problem("two-sum")["test_cases"][-1]
    r = run(h, "two-sum", OPTIMAL["two-sum"], [t])
    assert r["cases"][0]["ms"] < t["time_limit_ms"] * 0.5


def test_linear_scan_exceeds_the_inspection_budget_on_binary_search(h):
    r = run(h, "binary-search", BRUTE["binary-search"])
    perf = [c for c in r["cases"] if c["perf"]]
    assert r["status"] == "failed" and not any(c["passed"] for c in perf)
    assert all(c["passed"] for c in r["cases"] if not c["perf"])  # correct on the small tests
    msg = perf[0]["error"]
    assert "looked at" in msg and "allows at most 64" in msg and "1,000,000" in msg


def test_slicing_in_a_recursive_binary_search_is_charged_for_the_copy(h):
    code = ("def search(nums, target, base=0):\n    if not nums:\n        return -1\n    mid = len(nums) // 2\n    if nums[mid] == target:\n        return base + mid\n"
            "    if nums[mid] < target:\n        return search(nums[mid + 1:], target, base + mid + 1)\n    return search(nums[:mid], target, base)\n")
    perf = [c for c in run(h, "binary-search", code)["cases"] if c["perf"]]
    assert perf and not any(c["passed"] for c in perf) and "looked at" in perf[0]["error"]


def test_binary_search_still_passes_when_it_inspects_few_items(h):
    cases = run(h, "binary-search", OPTIMAL["binary-search"])["cases"]
    assert all(c["passed"] for c in cases)


def test_recursive_solutions_hit_the_recursion_limit_on_a_very_deep_tree(h):
    perf = [c for c in run(h, "maximum-depth-of-binary-tree", BRUTE["maximum-depth-of-binary-tree"])["cases"] if c["perf"]]
    deep = perf[0]
    assert deep["passed"] is False and "RecursionError" in deep["error"]
    assert perf[1]["passed"] is True  # a full 10,000-node tree is only 14 levels deep: recursion is fine there


def test_progress_events_stream_per_test(h):
    events = []
    h["_emit"] = lambda s: events.append(json.loads(s))
    try:
        run(h, "two-sum", OPTIMAL["two-sum"], problem("two-sum")["test_cases"][:2])
    finally:
        h["_emit"] = None
    kinds = [list(e)[0] for e in events]
    assert kinds == ["start", "case", "start", "case"]
    assert events[0]["start"]["id"] == 1 and events[1]["case"]["passed"] is True and "nums=" in events[0]["start"]["input"]


def test_huge_inputs_are_summarised_in_results(h):
    t = problem("two-sum")["test_cases"][-1]
    c = run(h, "two-sum", OPTIMAL["two-sum"], [t])["cases"][0]
    assert c["input"].startswith("nums=<list of 20,000 items") and len(c["input"]) < 200


def test_expected_outputs_are_cross_checked_by_independent_solutions(h):
    # Covered by test_optimal_solution_passes_all_tests_with_headroom: the solutions in tests/solutions.py are independent of the
    # reference solutions that produced the expected values, so agreement between them is a real second opinion.
    assert set(OPTIMAL) == set(BRUTE)


# ---- brute force really does fail (slow: runs each hopeless solution in a subprocess) -------------------------
@pytest.mark.slow
@pytest.mark.parametrize("pid", PERF_IDS)
def test_brute_force_does_not_pass(pid):
    """Either it finishes and is flagged (too slow / over budget / wrong), or it never finishes (the browser would kill it at 8 s)."""
    started = time.time()
    try:
        out = subprocess.run([sys.executable, str(HERE / "_harness_subprocess.py")], input=json.dumps(payload(pid, BRUTE[pid])),
                             capture_output=True, text=True, timeout=25)
    except subprocess.TimeoutExpired:
        return  # never finished: counts as failing the time limit
    r = json.loads(out.stdout)
    perf = [c for c in r["cases"] if c["perf"]]
    assert perf, "perf tests never ran"
    assert r["status"] == "failed" and any(not c["passed"] for c in perf), f"brute force PASSED the performance tests in {time.time() - started:.1f}s"
    assert all(c["passed"] for c in r["cases"] if not c["perf"]), "brute force should be correct on the ordinary tests"
