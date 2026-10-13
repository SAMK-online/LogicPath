import builtins, contextlib, copy, io, json, sys, time, traceback
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _build_tree(values):
    if not values:
        return None
    nodes = [None if v is None else TreeNode(v) for v in values]
    kids = iter(nodes[1:])
    for n in nodes:
        if n is None:
            continue
        n.left = next(kids, None)
        n.right = next(kids, None)
    return nodes[0]

def _dump_tree(root):
    out, q = [], deque([root])
    while q:
        n = q.popleft()
        if n is None:
            out.append(None)
            continue
        out.append(n.val)
        q.append(n.left)
        q.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return out

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def _build_list(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def _dump_list(head):
    if head is not None and not isinstance(head, ListNode):
        raise TypeError(f"Return the head of the list (a ListNode or None), not a {type(head).__name__}.")
    out, seen = [], set()
    while head is not None:
        if id(head) in seen:
            raise ValueError("The list you returned loops back on itself, so it has no end.")
        seen.add(id(head))
        out.append(head.val)
        head = head.next
    return out

def _converters(sig):
    """How to turn each parameter's JSON into the object the student's function expects, and the return value back into JSON."""
    def kind(t):
        return "tree" if t.startswith("Optional[TreeNode]") else "list" if t.startswith("Optional[ListNode]") else None
    build = {"tree": _build_tree, "list": _build_list, None: None}
    return [build[kind(p["type"])] for p in sig["params"]], {"tree": _dump_tree, "list": _dump_list, None: None}[kind(sig["return_type"])]

def _eq(actual, expected):
    if isinstance(expected, bool):
        return isinstance(actual, bool) and actual == expected
    if isinstance(expected, float) or isinstance(actual, float):
        try:
            return abs(actual - expected) < 1e-9
        except TypeError:
            return False
    if isinstance(expected, list):
        return isinstance(actual, (list, tuple)) and len(actual) == len(expected) and all(_eq(a, e) for a, e in zip(actual, expected))
    if isinstance(expected, dict):
        return isinstance(actual, dict) and actual.keys() == expected.keys() and all(_eq(actual[k], expected[k]) for k in expected)
    return actual == expected

def _short(v, limit=300):
    s = repr(v)
    return s if len(s) <= limit else s[:limit] + "..."

# ------------------------------------------------------- generated inputs ---
# Large test inputs are stored as tiny specs ({"$gen": ...}) and expanded here, so fixtures stay small and every
# machine builds byte-identical data. scripts/build_fixtures.py imports THIS file to compute expected outputs.

class _Rng:
    """Deterministic 64-bit LCG: identical output on every Python version (unlike the random module's guarantees)."""
    def __init__(self, seed):
        self.x = (seed * 6364136223846793005 + 1442695040888963407) % (1 << 64)
    def next(self):
        self.x = (self.x * 6364136223846793005 + 1442695040888963407) % (1 << 64)
        return self.x >> 33
    def below(self, n):
        return self.next() % n
    def between(self, lo, hi):
        return lo + self.below(hi - lo + 1)
    def shuffle(self, items):
        for i in range(len(items) - 1, 0, -1):
            j = self.below(i + 1)
            items[i], items[j] = items[j], items[i]
        return items

class _CountingList(list):
    """A list that counts how many elements the student's code looks at (for tests that cap work, not time)."""
    accesses = 0
    def __getitem__(self, i):
        if isinstance(i, slice):
            self.accesses += len(range(*i.indices(len(self))))
        else:
            self.accesses += 1
        return list.__getitem__(self, i)
    def __iter__(self):
        self.accesses += len(self)
        return list.__iter__(self)
    def __contains__(self, x):
        self.accesses += len(self)
        return list.__contains__(self, x)
    def index(self, *a):
        self.accesses += len(self)
        return list.index(self, *a)
    def count(self, x):
        self.accesses += len(self)
        return list.count(self, x)

def _gen(spec):
    kind = spec["$gen"]
    if kind == "range":
        return list(range(spec.get("start", 0), spec["stop"], spec.get("step", 1)))
    if kind == "shuffled_range":
        return _Rng(spec["seed"]).shuffle(list(range(spec["n"])))
    if kind == "randints":
        r = _Rng(spec["seed"])
        return [r.between(spec["lo"], spec["hi"]) for _ in range(spec["n"])]
    if kind == "randstr":
        r, alpha = _Rng(spec["seed"]), spec["alphabet"]
        return "".join(alpha[r.below(len(alpha))] for _ in range(spec["n"]))
    if kind == "const":
        return [spec["value"]] * spec["n"]
    if kind == "repeat":
        return _expand(spec["of"]) * spec["times"]
    if kind == "concat":
        parts = [_expand(p) for p in spec["parts"]]
        return "".join(parts) if all(isinstance(p, str) for p in parts) else [x for p in parts for x in p]
    if kind == "reversed":
        return _expand(spec["of"])[::-1]
    if kind == "shuffle":
        v = _expand(spec["of"])
        items = list(v)
        _Rng(spec["seed"]).shuffle(items)
        return "".join(items) if isinstance(v, str) else items
    if kind == "words":
        return [f"{spec.get('prefix', 'w')}{i}" for i in range(spec["n"])]
    if kind == "join":
        return spec.get("sep", " ").join(_expand(spec["of"]))
    if kind == "dict_const":
        return {k: spec["value"] for k in _expand(spec["keys"])}
    if kind == "counting_list":
        return _CountingList(_expand(spec["of"]))
    if kind == "random_tree_edges":  # a random tree on n nodes as an edge list: node i hangs off a random earlier node
        r = _Rng(spec["seed"])
        return [[r.below(i), i] for i in range(1, spec["n"])]
    if kind == "random_edges":  # m distinct undirected edges between n nodes
        r, seen, out = _Rng(spec["seed"]), set(), []
        while len(out) < spec["m"]:
            a, b = r.below(spec["n"]), r.below(spec["n"])
            if a == b or (min(a, b), max(a, b)) in seen:
                continue
            seen.add((min(a, b), max(a, b)))
            out.append([a, b])
        return out
    if kind == "skewed_tree":  # right-leaning chain 1 -> 2 -> ... -> n, as a level-order list
        out = [1]
        for v in range(2, spec["n"] + 1):
            out += [None, v]
        return out
    raise ValueError(f"unknown generator: {kind}")

def _has_gen(v):
    if isinstance(v, dict):
        return "$gen" in v or any(_has_gen(x) for x in v.values())
    if isinstance(v, list):
        return any(_has_gen(x) for x in v)
    return False

def _expand(v):
    if isinstance(v, dict) and "$gen" in v:
        return _gen(v)
    if isinstance(v, list):
        return [_expand(x) for x in v]
    if isinstance(v, dict):
        return {k: _expand(x) for k, x in v.items()}
    return v

def _describe(v):
    """Compact display of an input/output: huge values are summarised, not dumped into the results table."""
    if isinstance(v, (list, tuple)) and len(v) > 12:
        head = ", ".join(_short(x, 12) for x in v[:4])
        return f"<{'tuple' if isinstance(v, tuple) else 'list'} of {len(v):,} items: [{head}, ...]>"
    if isinstance(v, str) and len(v) > 60:
        return f"<str of {len(v):,} chars: {v[:16]!r}...>"
    if isinstance(v, dict) and len(v) > 8:
        return f"<dict of {len(v):,} entries>"
    return _short(v, 300)

_emit = None  # the worker sets this to stream per-test progress to the page (so a killed run still shows what finished)

def _notify(obj):
    cb = globals().get("_emit")
    if cb is not None:
        try:
            cb(json.dumps(obj))
        except Exception:
            pass

def _human_ms(ms):
    return f"{ms} ms" if ms < 1000 else f"{ms / 1000:.1f} s"

def _fmt_exc(exc):
    try:
        tb = traceback.extract_tb(exc.__traceback__)
        line = next((f.lineno for f in reversed(tb) if f.filename == "<solution>"), None)
    except Exception:  # e.g. the student broke a builtin that traceback needs: still report the error itself
        line = None
    where = f" (line {line})" if line else ""
    return f"{type(exc).__name__}: {exc}{where}"

def _restore(builtins_snapshot, modules_snapshot):
    builtins.__dict__.clear()
    builtins.__dict__.update(builtins_snapshot)
    for m in set(sys.modules) - modules_snapshot:
        sys.modules.pop(m, None)

def _clip_output(text):
    return text if len(text) <= 5000 else text[:5000] + "\n... (output truncated)"

def _load_student(code, fn_name, out):
    """Compile + exec the student's code in a brand-new namespace. Returns (fn, error_message)."""
    try:
        compiled = compile(code, "<solution>", "exec")
    except SyntaxError as e:
        return None, f"SyntaxError: {e.msg} (line {e.lineno})" + (f"\n{e.text.rstrip()}" if e.text else "")
    ns = {"__name__": "__student__", "TreeNode": TreeNode, "ListNode": ListNode}
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            exec(compiled, ns)
    except BaseException as e:
        return None, _fmt_exc(e)
    fn = ns.get(fn_name)
    if not callable(fn):
        return None, f"Missing function: define 'def {fn_name}(...)' in your code."
    return fn, None

def _run(payload):
    code, sig, tests, comparison = payload["code"], payload["signature"], payload["tests"], payload["comparison"]
    fn_name = sig["name"]
    builders, dump_return = _converters(sig)
    out = io.StringIO()
    builtins_snapshot = dict(builtins.__dict__)
    modules_snapshot = set(sys.modules)
    result = {"status": "error", "cases": [], "stdout": "", "error": None}
    try:
        fn, load_error = _load_student(code, fn_name, out)
        if load_error:
            result["error"] = load_error
            return result

        passed = 0
        names = [p["name"] for p in sig["params"]]
        for t in tests:
            raw = t["args"]
            args = _expand(raw) if _has_gen(raw) else copy.deepcopy(raw)  # generated data is fresh each time; literals are copied
            expected = _expand(t["expected"]) if _has_gen(t["expected"]) else t["expected"]
            shown = ", ".join(f"{n}={_describe(a)}" for n, a in zip(names, args))
            counters = [a for a in args if isinstance(a, _CountingList)]
            args = [b(a) if b else a for a, b in zip(args, builders)]
            case = {"id": t["id"], "input": shown, "expected": _describe(expected), "actual": "", "passed": False, "error": None,
                    "perf": bool(t.get("perf")), "label": t.get("label"), "ms": None, "timed_out": False}
            _notify({"start": {"id": t["id"], "input": shown, "label": t.get("label"), "perf": case["perf"]}})
            try:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                    t0 = time.perf_counter()
                    actual = fn(*args)
                    elapsed = int((time.perf_counter() - t0) * 1000)
                case["ms"] = elapsed
                if dump_return:
                    actual = dump_return(actual)
                case["actual"] = _describe(actual)
                if t.get("unchecked"):
                    # A student's own experiment with no expected answer: show what the function returned, judge nothing.
                    case["passed"], case["expected"] = True, ""
                else:
                    exp = expected
                    if comparison == "sorted" and isinstance(actual, (list, tuple)) and isinstance(exp, list):
                        try:
                            actual, exp = sorted(actual), sorted(exp)
                        except TypeError:
                            pass
                    case["passed"] = _eq(actual, exp)
                    # Correctness first; only a correct answer is judged on speed or work done.
                    limit, budget = t.get("time_limit_ms"), t.get("max_accesses")
                    if case["passed"] and limit and elapsed > limit:
                        case["passed"], case["timed_out"] = False, True
                        case["error"] = (f"Time limit exceeded: took {_human_ms(elapsed)}, the limit is {_human_ms(limit)}. "
                                         "This input is within the constraints, so the solution has to scale to it. "
                                         "How does the work your code does grow with the size of the input?")
                    if case["passed"] and budget is not None and counters:
                        used = sum(c.accesses for c in counters)
                        if used > budget:
                            case["passed"] = False
                            case["error"] = (f"Your code looked at {used:,} of the {max(len(c) for c in counters):,} items; this test allows at most {budget:,}. "
                                             "The problem asks for O(log n) time. How many items does each step of your search need to look at?")
            except BaseException as e:
                case["error"] = _fmt_exc(e)
            passed += case["passed"]
            result["cases"].append(case)
            _notify({"case": case})
        result["status"] = "passed" if passed == len(tests) else "failed"
        return result
    finally:
        _restore(builtins_snapshot, modules_snapshot)  # first: student code may have broken builtins we are about to use
        result["stdout"] = _clip_output(out.getvalue())

def run_payload(payload_json):
    return json.dumps(_run(json.loads(payload_json)))

# ---------------------------------------------------------------- tracing ---
_MAX_ITEMS = 50      # list/set/dict entries kept per snapshot
_MAX_DEPTH = 3       # container nesting kept
_MAX_STR = 80

class _TraceStop(BaseException):
    """Raised to abort a run once the step budget is spent. BaseException so a student's `except Exception` can't eat it."""

def _snap(v, depth=0):
    """JSON-safe, size-bounded snapshot of a value. Never raises."""
    try:
        if v is None or isinstance(v, (bool, int, float)):
            if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
                return {"t": "obj", "v": repr(v)}
            return v
        if isinstance(v, str):
            return v if len(v) <= _MAX_STR else v[:_MAX_STR] + "..."
        if isinstance(v, TreeNode):
            return {"t": "tree", "v": _dump_tree_limited(v)}
        if isinstance(v, ListNode):
            return _snap_linked(v)
        if depth >= _MAX_DEPTH:
            return {"t": "obj", "v": _short(v, 40)}
        if isinstance(v, (list, tuple)):
            return {"t": "tuple" if isinstance(v, tuple) else "list", "n": len(v), "v": [_snap(x, depth + 1) for x in list(v)[:_MAX_ITEMS]]}
        if isinstance(v, (set, frozenset)):
            items = list(v)[:_MAX_ITEMS]
            try:
                items = sorted(items)
            except TypeError:
                pass
            return {"t": "set", "n": len(v), "v": [_snap(x, depth + 1) for x in items]}
        if isinstance(v, dict):
            return {"t": "dict", "n": len(v), "v": [[_snap(k, depth + 1), _snap(x, depth + 1)] for k, x in list(v.items())[:_MAX_ITEMS]]}
        return {"t": "obj", "v": _short(v, 60)}
    except Exception:
        return {"t": "obj", "v": "<unprintable>"}

def _snap_linked(head, limit=_MAX_ITEMS):
    """A linked list as its values in order. `loop` marks a list that never ends (a cycle) or is longer than we draw."""
    vals, seen, node, loop = [], set(), head, False
    while node is not None and len(vals) < limit:
        if id(node) in seen:
            loop = True
            break
        seen.add(id(node))
        vals.append(_snap(node.val, _MAX_DEPTH))
        node = node.next
    snap = {"t": "linked", "n": len(vals), "v": vals}
    if loop or node is not None:
        snap["more"] = True
    return snap

def _dump_tree_limited(root, limit=63):
    out, q, count = [], [root], 0
    while q and count < limit:
        n = q.pop(0)
        if n is None:
            out.append(None)
            continue
        count += 1
        out.append(_snap(n.val, _MAX_DEPTH))
        q += [getattr(n, "left", None), getattr(n, "right", None)]
    while out and out[-1] is None:
        out.pop()
    return out

def _visible_locals(frame):
    res = {}
    for k, v in list(frame.f_locals.items()):
        if k.startswith("__") or callable(v) or type(v).__name__ == "module":
            continue
        res[k] = _snap(v)
    return res

def _trace(payload):
    code, sig, test, max_steps = payload["code"], payload["signature"], payload["test"], int(payload.get("maxSteps", 500))
    fn_name = sig["name"]
    builders, dump_return = _converters(sig)
    names = [p["name"] for p in sig["params"]]
    out = io.StringIO()
    builtins_snapshot = dict(builtins.__dict__)
    modules_snapshot = set(sys.modules)
    res = {"status": "error", "error": None, "steps": [], "truncated": False, "result": None, "expected": _snap(_expand(test["expected"]) if _has_gen(test["expected"]) else test["expected"]),
           "stdout": "", "args": names}
    steps = res["steps"]
    state = {"depth": 0, "stopped": False}

    def local_tracer(frame, event, arg):
        if state["stopped"]:
            raise _TraceStop()  # a bare `except:` in student code can't keep the loop alive: we re-raise on the next event
        if event not in ("call", "line", "return", "exception"):
            return local_tracer
        if len(steps) >= max_steps:
            state["stopped"] = True
            res["truncated"] = True
            raise _TraceStop()
        step = {"line": frame.f_lineno, "event": event, "depth": state["depth"], "locals": _visible_locals(frame)}
        if event == "call":
            state["depth"] += 1
            step["depth"] = state["depth"]
        elif event == "return":
            step["ret"] = _snap(arg)
            state["depth"] = max(state["depth"] - 1, 0)
        elif event == "exception":
            step["exc"] = f"{arg[0].__name__}: {arg[1]}"[:200]
        steps.append(step)
        return local_tracer

    def global_tracer(frame, event, arg):
        if frame.f_code.co_filename != "<solution>":
            return None  # don't trace library code
        return local_tracer(frame, event, arg)

    try:
        fn, load_error = _load_student(code, fn_name, out)
        if load_error:
            res["error"] = load_error
            return res
        args = _expand(test["args"]) if _has_gen(test["args"]) else copy.deepcopy(test["args"])
        args = [b(a) if b else a for a, b in zip(args, builders)]
        res["status"] = "ok"
        try:
            sys.settrace(global_tracer)
            try:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                    value = fn(*args)
            finally:
                sys.settrace(None)
            res["result"] = _snap(dump_return(value) if dump_return else value)
        except _TraceStop:
            res["error"] = f"Trace stopped after {max_steps} steps. Your code may be looping, or it just runs for a long time."
        except BaseException as e:
            res["error"] = _fmt_exc(e)
        return res
    finally:
        sys.settrace(None)
        _restore(builtins_snapshot, modules_snapshot)
        res["stdout"] = _clip_output(out.getvalue())

def trace_payload(payload_json):
    return json.dumps(_trace(json.loads(payload_json)))
