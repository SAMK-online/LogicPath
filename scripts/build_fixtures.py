"""Generate shared/problem-fixtures/*.json.

Expected outputs are COMPUTED from the reference solutions below, so test data
can't drift from the intended behaviour. Reference solutions live only in this
build script: they are never loaded by the API, never sent to the browser and
never given to the LLM tutor.

Run:  python scripts/build_fixtures.py
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "shared" / "problem-fixtures"
HARNESS = Path(__file__).resolve().parent.parent / "frontend" / "src" / "workers" / "harness.py"

# Large performance inputs are described as {"$gen": ...} specs and expanded by the SAME code the browser runs.
_h: dict = {}
exec(compile(HARNESS.read_text(), str(HARNESS), "exec"), _h)
expand = _h["_expand"]

# ---------------------------------------------------------------------------
# Tree helpers (level-order list with None for missing nodes, LeetCode style)
# ---------------------------------------------------------------------------


class _Node:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def _build(values):
    if not values:
        return None
    nodes = [None if v is None else _Node(v) for v in values]
    kids = iter(nodes[1:])
    for n in nodes:
        if n is None:
            continue
        n.left = next(kids, None)
        n.right = next(kids, None)
    return nodes[0]


def _dump(root):
    out, q = [], [root]
    while q:
        n = q.pop(0)
        if n is None:
            out.append(None)
            continue
        out.append(n.val)
        q += [n.left, n.right]
    while out and out[-1] is None:
        out.pop()
    return out


# ---------------------------------------------------------------------------
# Reference solutions
# ---------------------------------------------------------------------------
def ref_celsius_to_fahrenheit(celsius): return celsius * 9 / 5 + 32
def ref_even_or_odd(n): return "Even" if n % 2 == 0 else "Odd"
def ref_is_leap_year(year): return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
def ref_sum_of_digits(n): return sum(int(c) for c in str(n))
def ref_fizzbuzz(n):
    return ["FizzBuzz" if i % 15 == 0 else "Fizz" if i % 3 == 0 else "Buzz" if i % 5 == 0 else str(i) for i in range(1, n + 1)]
def ref_factorial(n):
    r = 1
    for i in range(2, n + 1):
        r *= i
    return r
def ref_reverse_string(s): return s[::-1]
def ref_is_palindrome(s): return s == s[::-1]
def ref_find_max(nums): return max(nums)
def ref_unique_in_order(nums):
    seen, out = set(), []
    for x in nums:
        if x not in seen:
            seen.add(x); out.append(x)
    return out
def ref_word_frequency(text):
    d = {}
    for w in text.lower().split():
        d[w] = d.get(w, 0) + 1
    return d
def ref_is_prime(n):
    if n < 2: return False
    i = 2
    while i * i <= n:
        if n % i == 0: return False
        i += 1
    return True
def ref_two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen: return [seen[target - x], i]
        seen[x] = i
def ref_contains_duplicate(nums): return len(set(nums)) != len(nums)
def ref_is_anagram(s, t): return sorted(s) == sorted(t)
def ref_valid_palindrome(s):
    c = [ch.lower() for ch in s if ch.isalnum()]
    return c == c[::-1]
def ref_max_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x); best = max(best, cur)
    return best
def ref_max_sum_k(nums, k):
    s = sum(nums[:k]); best = s
    for i in range(k, len(nums)):
        s += nums[i] - nums[i - k]; best = max(best, s)
    return best
def ref_valid_parentheses(s):
    pairs, st = {")": "(", "]": "[", "}": "{"}, []
    for ch in s:
        if ch in pairs:
            if not st or st.pop() != pairs[ch]: return False
        else:
            st.append(ch)
    return not st
def ref_binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target: return mid
        if nums[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1
def ref_fib(n):
    a, b = 0, 1
    for _ in range(n): a, b = b, a + b
    return a
def ref_max_depth(root):
    r = _build(root)
    depth, level = 0, ([r] if r else [])
    while level:
        depth += 1
        level = [c for n in level for c in (n.left, n.right) if c]
    return depth
def ref_invert_tree(root):
    r = _build(root)
    stack = [r] if r else []
    while stack:
        n = stack.pop()
        n.left, n.right = n.right, n.left
        stack += [c for c in (n.left, n.right) if c]
    return _dump(r)


# ---------------------------------------------------------------------------
# Problem definitions
# ---------------------------------------------------------------------------
def g(kind, **kw):
    return {"$gen": kind, **kw}


REFS: dict = {}


def P(id, title, difficulty, topic, description, fn, params, ret, starter_body, examples, constraints, cases, ref,
      compare="exact", doc=None):
    sig = ", ".join(f"{n}: {t}" for n, t in params)
    imports = ""
    if any("List" in t for _, t in params) or "List" in ret:
        imports = "from typing import List\n\n\n"
    if any("Optional" in t for _, t in params) or "Optional" in ret:
        imports = "from typing import List, Optional\n\n\n"
    starter = f'{imports}def {fn}({sig}) -> {ret}:\n    # Write your solution here\n{starter_body}\n'
    REFS[id] = ref
    return {
        "id": id, "title": title, "difficulty": difficulty, "topic": topic, "description": description,
        "function_signature": {"name": fn, "params": [{"name": n, "type": t} for n, t in params], "return_type": ret},
        "starter_code": starter, "examples": examples, "constraints": constraints,
        "comparison": compare,
        "test_cases": [
            {"id": i + 1, "args": a, "expected": ref(*[expand(json.loads(json.dumps(x))) for x in a])}
            for i, a in enumerate(cases)
        ],
    }


def ex(i, o, e=None):
    d = {"input": i, "output": o}
    if e: d["explanation"] = e
    return d


PASS = "    pass"
problems = []

# ---- Python Foundations ----------------------------------------------------
problems += [
    P("celsius-to-fahrenheit", "Celsius to Fahrenheit", "Easy", "Variables and data types",
      "Write a function that converts a temperature from Celsius to Fahrenheit.\n\nThe formula is `F = C × 9 / 5 + 32`.",
      "celsius_to_fahrenheit", [("celsius", "int")], "float", PASS,
      [ex("celsius = 100", "212.0"), ex("celsius = -40", "-40.0")],
      ["`celsius` is a multiple of 5.", "`-100 <= celsius <= 100`"],
      [[0], [100], [-40], [20], [25], [-10]], ref_celsius_to_fahrenheit),
    P("even-or-odd", "Even or Odd", "Easy", "Conditions",
      'Return the string `"Even"` if `n` is even, otherwise return `"Odd"`.',
      "even_or_odd", [("n", "int")], "str", PASS,
      [ex("n = 4", '"Even"'), ex("n = 7", '"Odd"')], ["`-1000 <= n <= 1000`"],
      [[0], [1], [2], [-3], [10], [7], [-8]], ref_even_or_odd),
    P("leap-year", "Leap Year", "Easy", "Conditions",
      "A year is a leap year if it is divisible by 4, **except** years divisible by 100, which are leap years only if they are also divisible by 400.\n\nReturn `True` if `year` is a leap year, otherwise `False`.",
      "is_leap_year", [("year", "int")], "bool", PASS,
      [ex("year = 2024", "True"), ex("year = 1900", "False", "1900 is divisible by 100 but not by 400.")],
      ["`1 <= year <= 9999`"], [[2000], [1900], [2024], [2023], [2100], [1600], [4]], ref_is_leap_year),
    P("fizzbuzz", "FizzBuzz", "Easy", "Loops",
      'Given an integer `n`, return a list of strings for the numbers `1` through `n`:\n\n- `"FizzBuzz"` if the number is divisible by both 3 and 5\n- `"Fizz"` if divisible by 3\n- `"Buzz"` if divisible by 5\n- otherwise the number itself as a string',
      "fizzbuzz", [("n", "int")], "List[str]", "    pass",
      [ex("n = 5", '["1", "2", "Fizz", "4", "Buzz"]')], ["`1 <= n <= 1000`"],
      [[1], [3], [5], [15], [20]], ref_fizzbuzz),
    P("sum-of-digits", "Sum of Digits", "Easy", "Loops",
      "Given a non-negative integer `n`, return the sum of its decimal digits.",
      "sum_of_digits", [("n", "int")], "int", PASS,
      [ex("n = 1234", "10", "1 + 2 + 3 + 4 = 10")], ["`0 <= n <= 10**9`"],
      [[0], [7], [1234], [999], [100000], [909090]], ref_sum_of_digits),
    P("factorial", "Factorial", "Easy", "Functions",
      "Write a function that returns `n!` (n factorial): the product of all positive integers up to `n`. By definition `0! = 1`.",
      "factorial", [("n", "int")], "int", PASS,
      [ex("n = 5", "120", "5 × 4 × 3 × 2 × 1 = 120"), ex("n = 0", "1")], ["`0 <= n <= 20`"],
      [[0], [1], [5], [7], [10], [20]], ref_factorial),
    P("reverse-string", "Reverse a String", "Easy", "Strings",
      "Return the string `s` reversed.",
      "reverse_string", [("s", "str")], "str", PASS,
      [ex('s = "hello"', '"olleh"')], ["`0 <= len(s) <= 1000`"],
      [[""], ["a"], ["hello"], ["Python 3"], ["abba"]], ref_reverse_string),
    P("palindrome-check", "Palindrome Check", "Easy", "Strings",
      "Return `True` if `s` reads the same forwards and backwards, otherwise `False`.\n\nThe comparison is exact: it is case-sensitive and every character counts.",
      "is_palindrome", [("s", "str")], "bool", PASS,
      [ex('s = "racecar"', "True"), ex('s = "Aba"', "False", '"A" and "a" are different characters.')],
      ["`0 <= len(s) <= 1000`"], [["racecar"], ["hello"], [""], ["abba"], ["Aba"], ["x"]], ref_is_palindrome),
    P("find-maximum-element", "Find Maximum Element", "Easy", "Lists",
      "Given a non-empty list of integers, return the largest one.\n\nTry to solve it with a loop before reaching for the built-in `max()`.",
      "find_max", [("nums", "List[int]")], "int", PASS,
      [ex("nums = [3, 9, 2]", "9")], ["`1 <= len(nums) <= 1000`", "`-10**6 <= nums[i] <= 10**6`"],
      [[[5]], [[3, 9, 2]], [[-4, -1, -7]], [[1, 1, 1]], [[0, -2, 8, 8, 3]]], ref_find_max),
    P("unique-in-order", "Unique in Order", "Easy", "Lists",
      "Return a new list that contains each distinct value of `nums` exactly once, keeping the order of **first appearance**.",
      "unique_in_order", [("nums", "List[int]")], "List[int]", PASS,
      [ex("nums = [3, 1, 3, 2, 1]", "[3, 1, 2]")], ["`0 <= len(nums) <= 1000`"],
      [[[]], [[1]], [[3, 1, 3, 2, 1]], [[5, 5, 5]], [[1, 2, 3]]], ref_unique_in_order),
    P("word-frequency", "Word Frequency", "Easy", "Dictionaries",
      "Given a string `text`, return a dictionary that maps each word to the number of times it appears.\n\nWords are separated by whitespace and compared **case-insensitively** (store them lowercase).",
      "word_frequency", [("text", "str")], "dict", PASS,
      [ex('text = "the cat The dog"', '{"the": 2, "cat": 1, "dog": 1}')],
      ["`0 <= len(text) <= 1000`", "Words contain only letters."],
      [[""], ["a b a"], ["the cat The dog"], ["go Go GO"], ["one two three"]], ref_word_frequency),
    P("prime-check", "Prime Check", "Easy", "Basic programming logic",
      "Return `True` if `n` is a prime number, otherwise `False`.\n\nA prime is an integer greater than 1 whose only divisors are 1 and itself.",
      "is_prime", [("n", "int")], "bool", PASS,
      [ex("n = 17", "True"), ex("n = 1", "False")], ["`0 <= n <= 10**6`"],
      [[0], [1], [2], [3], [4], [17], [18], [97], [100], [7919]], ref_is_prime),
]

# ---- DSA Fundamentals + Blind 75 overlap -----------------------------------
problems += [
    P("two-sum", "Two Sum", "Easy", "Hash maps",
      "Given a list of integers `nums` and an integer `target`, return the **indices** of the two numbers that add up to `target`.\n\nYou may assume exactly one solution exists, and you may not use the same element twice. The answer may be returned in any order.",
      "two_sum", [("nums", "List[int]"), ("target", "int")], "List[int]", PASS,
      [ex("nums = [2, 7, 11, 15], target = 9", "[0, 1]", "nums[0] + nums[1] == 9"),
       ex("nums = [3, 2, 4], target = 6", "[1, 2]")],
      ["`2 <= len(nums) <= 10**4`", "`-10**9 <= nums[i] <= 10**9`", "Exactly one valid answer exists."],
      [[[2, 7, 11, 15], 9], [[3, 2, 4], 6], [[3, 3], 6], [[-1, -2, -3, -4, -5], -8], [[0, 4, 3, 0], 0],
       [g("concat", parts=[g("range", start=1, stop=2001), [100000]]), 100000 + 1999]],
      ref_two_sum, compare="sorted"),
    P("contains-duplicate", "Contains Duplicate", "Easy", "Hash maps",
      "Given a list of integers `nums`, return `True` if any value appears **at least twice**, and `False` if every element is distinct.",
      "contains_duplicate", [("nums", "List[int]")], "bool", PASS,
      [ex("nums = [1, 2, 3, 1]", "True"), ex("nums = [1, 2, 3, 4]", "False")],
      ["`1 <= len(nums) <= 10**5`", "`-10**9 <= nums[i] <= 10**9`"],
      [[[1, 2, 3, 1]], [[1, 2, 3, 4]], [[1]], [[1, 1, 1, 3, 3, 4, 3, 2, 4, 2]], [g("range", start=0, stop=5000)], [g("concat", parts=[g("range", start=0, stop=5000), [0]])]],
      ref_contains_duplicate),
    P("valid-anagram", "Valid Anagram", "Easy", "Hash maps",
      "Given two strings `s` and `t`, return `True` if `t` is an anagram of `s` (it uses exactly the same letters with the same counts), otherwise `False`.",
      "is_anagram", [("s", "str"), ("t", "str")], "bool", PASS,
      [ex('s = "anagram", t = "nagaram"', "True"), ex('s = "rat", t = "car"', "False")],
      ["`1 <= len(s), len(t) <= 5 * 10**4`", "Both strings contain lowercase English letters."],
      [["anagram", "nagaram"], ["rat", "car"], ["a", "a"], ["ab", "a"], ["aacc", "ccac"]], ref_is_anagram),
    P("maximum-subarray", "Maximum Subarray", "Medium", "Arrays",
      "Given a list of integers `nums`, find the contiguous subarray (containing at least one number) with the **largest sum**, and return that sum.",
      "max_sub_array", [("nums", "List[int]")], "int", PASS,
      [ex("nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]", "6", "The subarray [4, -1, 2, 1] has the largest sum 6."),
       ex("nums = [1]", "1")],
      ["`1 <= len(nums) <= 10**5`", "`-10**4 <= nums[i] <= 10**4`"],
      [[[-2, 1, -3, 4, -1, 2, 1, -5, 4]], [[1]], [[5, 4, -1, 7, 8]], [[-3, -1, -2]], [[2, -1, 2, -1, 2]], [[-1]]],
      ref_max_subarray),
    P("valid-palindrome", "Valid Palindrome", "Easy", "Two pointers",
      "A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing every non-alphanumeric character, it reads the same forwards and backwards.\n\nGiven a string `s`, return `True` if it is a palindrome, otherwise `False`.",
      "is_palindrome", [("s", "str")], "bool", PASS,
      [ex('s = "A man, a plan, a canal: Panama"', "True"), ex('s = "race a car"', "False")],
      ["`1 <= len(s) <= 2 * 10**5`", "`s` consists of printable ASCII characters."],
      [["A man, a plan, a canal: Panama"], ["race a car"], [" "], ["0P"], ["No lemon, no melon"]], ref_valid_palindrome),
    P("max-sum-subarray-size-k", "Maximum Sum Subarray of Size K", "Easy", "Sliding window",
      "Given a list of integers `nums` and an integer `k`, return the largest sum of any **contiguous** window of exactly `k` elements.",
      "max_sum_subarray", [("nums", "List[int]"), ("k", "int")], "int", PASS,
      [ex("nums = [2, 1, 5, 1, 3, 2], k = 3", "9", "The window [5, 1, 3] sums to 9.")],
      ["`1 <= k <= len(nums) <= 10**5`", "`-10**4 <= nums[i] <= 10**4`"],
      [[[2, 1, 5, 1, 3, 2], 3], [[1], 1], [[-1, -2, -3], 2], [[4, 4, 4, 4], 4], [[1, 9, -1, -2, 7, 3, -1, 2], 4]],
      ref_max_sum_k),
    P("valid-parentheses", "Valid Parentheses", "Easy", "Stacks",
      "Given a string `s` containing only the characters `'('`, `')'`, `'{'`, `'}'`, `'['` and `']'`, determine whether it is valid.\n\nA string is valid when:\n\n- every opening bracket is closed by the same type of bracket,\n- brackets are closed in the correct order,\n- every closing bracket has a matching opening bracket.",
      "is_valid", [("s", "str")], "bool", PASS,
      [ex('s = "()[]{}"', "True"), ex('s = "(]"', "False"), ex('s = "([)]"', "False")],
      ["`1 <= len(s) <= 10**4`", "`s` consists only of the six bracket characters."],
      [["()"], ["()[]{}"], ["(]"], ["([)]"], ["{[]}"], ["("], ["]"], ["(((((())))))"]], ref_valid_parentheses),
    P("binary-search", "Binary Search", "Easy", "Binary search",
      "Given a list of integers `nums` sorted in **ascending** order and an integer `target`, return the index of `target` in `nums`, or `-1` if it is not present.\n\nYour algorithm should run in `O(log n)` time.",
      "search", [("nums", "List[int]"), ("target", "int")], "int", "    pass",
      [ex("nums = [-1, 0, 3, 5, 9, 12], target = 9", "4"), ex("nums = [-1, 0, 3, 5, 9, 12], target = 2", "-1")],
      ["`1 <= len(nums) <= 10**4`", "All values in `nums` are unique.", "`nums` is sorted in ascending order."],
      [[[-1, 0, 3, 5, 9, 12], 9], [[-1, 0, 3, 5, 9, 12], 2], [[5], 5], [[5], -5], [[1, 3], 1], [[1, 3], 3],
       [g("range", start=0, stop=20000, step=2), 19998], [g("range", start=0, stop=20000, step=2), 7]], ref_binary_search),
    P("fibonacci-number", "Fibonacci Number", "Easy", "Recursion",
      "The Fibonacci numbers satisfy `F(0) = 0`, `F(1) = 1` and `F(n) = F(n - 1) + F(n - 2)` for `n > 1`.\n\nGiven `n`, return `F(n)`. Try to express the solution recursively.",
      "fib", [("n", "int")], "int", PASS,
      [ex("n = 2", "1", "F(2) = F(1) + F(0) = 1"), ex("n = 4", "3")], ["`0 <= n <= 20`"],
      [[0], [1], [2], [4], [10], [20]], ref_fib),
    P("maximum-depth-of-binary-tree", "Maximum Depth of Binary Tree", "Easy", "Trees",
      "Given the `root` of a binary tree, return its **maximum depth**: the number of nodes along the longest path from the root down to the farthest leaf.\n\nA `TreeNode` class with `val`, `left` and `right` is provided for you. In the examples below, trees are written in level-order with `None` for a missing child.",
      "max_depth", [("root", "Optional[TreeNode]")], "int", PASS,
      [ex("root = [3, 9, 20, None, None, 15, 7]", "3"), ex("root = [1, None, 2]", "2")],
      ["`0 <= number of nodes <= 10**4`"],
      [[[3, 9, 20, None, None, 15, 7]], [[1, None, 2]], [[]], [[1]], [[1, 2, 3, 4, None, None, 5, 6]]], ref_max_depth),
    P("invert-binary-tree", "Invert Binary Tree", "Easy", "Trees",
      "Given the `root` of a binary tree, invert it (swap the left and right child of every node) and return its root.\n\nA `TreeNode` class with `val`, `left` and `right` is provided for you.",
      "invert_tree", [("root", "Optional[TreeNode]")], "Optional[TreeNode]", PASS,
      [ex("root = [4, 2, 7, 1, 3, 6, 9]", "[4, 7, 2, 9, 6, 3, 1]"), ex("root = [2, 1, 3]", "[2, 3, 1]")],
      ["`0 <= number of nodes <= 100`"],
      [[[4, 2, 7, 1, 3, 6, 9]], [[2, 1, 3]], [[]], [[1, 2]], [[1, None, 2]]], ref_invert_tree),
]

for p in problems:
    if p["function_signature"]["name"] in ("max_depth", "invert_tree"):
        p["starter_code"] = p["starter_code"].replace("# Write your solution here", "# TreeNode(val, left, right) is already defined for you.")

# ---------------------------------------------------------------------------
# Performance tests: inputs at the size the constraints allow, so a correct-but-brute-force solution fails on TIME,
# not on correctness. Each test has a per-test time limit (default 1 s) enforced by the browser harness; a correct
# optimal solution takes milliseconds, a brute-force one takes many seconds.
#   * args/expected may be {"$gen": ...} specs (see harness.py) so large data is not stored in the fixture
#   * `expected_spec` is checked against the reference solution here, so a wrong spec can't ship
#   * numbers stay below 2**53: values travel through JavaScript JSON, which can't represent larger integers exactly
# ---------------------------------------------------------------------------
ALPHA = "abcdefghijklmnopqrstuvwxyz"
_left_abc = g("repeat", of="abc", times=100000)
_left_punct = g("repeat", of="aB, c.", times=30000)
_nested = g("concat", parts=[g("repeat", of="(", times=100000), g("repeat", of=")", times=100000)])
_str_a = g("randstr", n=200000, alphabet=ALPHA, seed=9)
_evens = g("range", start=0, stop=2000000, step=2)


def _semiprime():
    """Product of two primes near sqrt(2**31 - 1): trial division by every number up to n is hopeless, up to sqrt(n) is instant."""
    q = 46340
    while not ref_is_prime(q):
        q -= 1
    p = q - 1
    while not ref_is_prime(p):
        p -= 1
    assert p * q <= 2**31 - 1 and not ref_is_prime(p * q)
    return p * q


PERF = {
    "even-or-odd": dict(constraints=["`-10**15 <= n <= 10**15`"], tests=[
        dict(args=[10**15], label="Huge value (10¹⁵)", ms=500),
        dict(args=[10**15 - 1], label="Huge odd value", ms=500),
        dict(args=[-(10**15) + 1], label="Huge negative odd value", ms=500)]),
    "reverse-string": dict(constraints=["`0 <= len(s) <= 5 * 10**5`"], tests=[
        dict(args=[g("repeat", of="abcde", times=100000)], expected_spec=g("repeat", of="edcba", times=100000),
             label="Long string (500,000 characters)")]),
    "palindrome-check": dict(constraints=["`0 <= len(s) <= 10**6`"], tests=[
        dict(args=[g("concat", parts=[_left_abc, g("reversed", of=_left_abc)])], expected_spec=True, label="Long palindrome (600,000 characters)"),
        dict(args=[g("concat", parts=[_left_abc, "zq", g("reversed", of=_left_abc)])], expected_spec=False,
             label="Long string that is almost a palindrome (600,002 characters)")]),
    "find-maximum-element": dict(constraints=["`1 <= len(nums) <= 5 * 10**4`", "`-10**6 <= nums[i] <= 10**6`"], tests=[
        dict(args=[g("randints", n=30000, lo=-10**6, hi=10**6, seed=7)], label="30,000 numbers"),
        # Equal values with the one larger value LAST: defeats "compare with everything, stop at the first bigger one" shortcuts.
        dict(args=[g("concat", parts=[g("const", value=5, n=29999), [6]])], label="29,999 equal numbers, then one larger")]),
    "unique-in-order": dict(constraints=["`0 <= len(nums) <= 5 * 10**4`"], tests=[
        dict(args=[g("shuffled_range", n=30000, seed=3)], expected_spec=g("shuffled_range", n=30000, seed=3), label="30,000 distinct numbers"),
        dict(args=[g("repeat", of=g("shuffled_range", n=15000, seed=4), times=2)], expected_spec=g("shuffled_range", n=15000, seed=4),
             label="15,000 distinct numbers, each appearing twice")]),
    "word-frequency": dict(constraints=["`0 <= len(text) <= 2 * 10**5`", "Words are made of letters and digits."], tests=[
        dict(args=[g("join", of=g("repeat", of=g("words", n=1500, prefix="w"), times=20), sep=" ")],
             expected_spec=g("dict_const", keys=g("words", n=1500, prefix="w"), value=20), label="30,000 words, 1,500 of them distinct")]),
    "prime-check": dict(constraints=["`0 <= n <= 2**31 - 1`"], tests=[
        dict(args=[2147483647], label="Large prime (2³¹ − 1)", ms=500),
        dict(args=[999999937], label="Large prime near 10⁹", ms=500),
        dict(args=[_semiprime()], label="Large number whose only factors are big", ms=500)]),
    "two-sum": dict(constraints=["`2 <= len(nums) <= 2 * 10**4`", "`-10**9 <= nums[i] <= 10**9`", "Exactly one valid answer exists."], tests=[
        dict(args=[g("shuffled_range", n=20000, seed=5), 39997], label="20,000 numbers; the answer is the two largest")]),
    "contains-duplicate": dict(constraints=["`1 <= len(nums) <= 10**5`", "`-10**9 <= nums[i] <= 10**9`"], tests=[
        dict(args=[g("shuffled_range", n=50000, seed=6)], label="50,000 distinct numbers"),
        dict(args=[g("concat", parts=[g("shuffled_range", n=50000, seed=6), [0]])], label="50,001 numbers, one repeated")]),
    "valid-anagram": dict(constraints=["`1 <= len(s), len(t) <= 2 * 10**5`", "Both strings contain lowercase English letters."], tests=[
        dict(args=[_str_a, g("shuffle", of=_str_a, seed=10)], label="Two random 200,000-letter strings"),
        dict(args=[g("repeat", of="a", times=200000), g("concat", parts=[g("repeat", of="a", times=199999), "b"])],
             label="200,000 letters that differ in only one place")]),
    "maximum-subarray": dict(constraints=["`1 <= len(nums) <= 10**5`", "`-10**4 <= nums[i] <= 10**4`"], tests=[
        dict(args=[g("randints", n=30000, lo=-10000, hi=10000, seed=11)], label="30,000 numbers"),
        dict(args=[g("randints", n=30000, lo=-10000, hi=-1, seed=12)], label="30,000 negative numbers")]),
    "valid-palindrome": dict(constraints=["`1 <= len(s) <= 10**6`", "`s` consists of printable ASCII characters."], tests=[
        dict(args=[g("concat", parts=[_left_punct, g("reversed", of=_left_punct)])], expected_spec=True, label="Long phrase with punctuation (360,000 characters)"),
        dict(args=[g("concat", parts=[_left_punct, "zq", g("reversed", of=_left_punct)])], expected_spec=False,
             label="Long phrase that is almost a palindrome")]),
    "max-sum-subarray-size-k": dict(constraints=["`1 <= k <= len(nums) <= 10**5`", "`-10**4 <= nums[i] <= 10**4`"], tests=[
        dict(args=[g("randints", n=100000, lo=-10000, hi=10000, seed=13), 50000], label="100,000 numbers, window of 50,000")]),
    "valid-parentheses": dict(constraints=["`1 <= len(s) <= 2 * 10**5`", "`s` consists only of the six bracket characters."], tests=[
        dict(args=[_nested], expected_spec=True, label="Deeply nested: 200,000 characters"),
        dict(args=[g("concat", parts=[g("repeat", of="{[(", times=33000), g("repeat", of=")]}", times=33000)])], expected_spec=True,
             label="Deeply nested with three kinds of brackets"),
        dict(args=[g("concat", parts=[_nested, ")"])], expected_spec=False, label="Deeply nested with one extra closing bracket")]),
    "binary-search": dict(constraints=["`1 <= len(nums) <= 10**6`", "All values in `nums` are unique.", "`nums` is sorted in ascending order."], tests=[
        dict(args=[g("counting_list", of=_evens), 1999998], max_accesses=64, label="Sorted list of 1,000,000 numbers; look at no more than 64 of them"),
        dict(args=[g("counting_list", of=_evens), 1000001], max_accesses=64, label="Same list, target is missing"),
        dict(args=[g("counting_list", of=_evens), 0], max_accesses=64, label="Same list, target is the first number")]),
    "fibonacci-number": dict(constraints=["`0 <= n <= 70`"], tests=[
        dict(args=[35], label="n = 35"), dict(args=[40], label="n = 40"), dict(args=[70], label="n = 70")]),
    "maximum-depth-of-binary-tree": dict(constraints=["`0 <= number of nodes <= 10**4`"], tests=[
        dict(args=[g("skewed_tree", n=2000)], label="Very deep tree (2,000 levels)"),
        dict(args=[g("range", start=1, stop=10001)], label="Full tree with 10,000 nodes")]),
    "invert-binary-tree": dict(constraints=["`0 <= number of nodes <= 10**4`"], tests=[
        dict(args=[g("skewed_tree", n=1500)], label="Very deep tree (1,500 levels)"),
        dict(args=[g("range", start=1, stop=4096)], label="Full tree with 4,095 nodes")]),
}

for p in problems:
    spec = PERF.get(p["id"])
    if not spec:
        continue
    if "constraints" in spec:
        p["constraints"] = spec["constraints"]
    ref = REFS[p["id"]]
    for t in spec["tests"]:
        computed = ref(*[expand(a) for a in t["args"]])
        if "expected_spec" in t:
            exp = t["expected_spec"]
            assert expand(exp) == computed, f"{p['id']}: expected_spec disagrees with the reference solution"
        else:
            exp = computed
        entry = {"id": len(p["test_cases"]) + 1, "args": t["args"], "expected": exp, "perf": True, "label": t["label"],
                 "time_limit_ms": t.get("ms", 1000)}
        if "max_accesses" in t:
            entry["max_accesses"] = t["max_accesses"]
        assert len(json.dumps(entry)) < 80_000, f"{p['id']}: perf test too large to ship ({len(json.dumps(entry))} bytes)"
        p["test_cases"].append(entry)

# ---------------------------------------------------------------------------
# Roadmaps
# ---------------------------------------------------------------------------
def slug(t):
    out = "".join(c.lower() if c.isalnum() else "-" for c in t)
    while "--" in out: out = out.replace("--", "-")
    return out.strip("-")

pf_topics = ["Variables and data types", "Conditions", "Loops", "Functions", "Strings", "Lists", "Dictionaries", "Basic programming logic"]
dsa_topics = ["Arrays", "Hash maps", "Two pointers", "Sliding window", "Stacks", "Binary search", "Recursion", "Trees"]
by_topic = lambda ts, ids: [{"name": t, "problems": [p["id"] for p in problems if p["topic"] == t and p["id"] in ids]} for t in ts]
pf_ids = {p["id"] for p in problems[:12]}
dsa_ids = {p["id"] for p in problems[12:]}

# Blind 75, grouped by the commonly circulated category names.
# Difficulty labels follow the LeetCode ratings. Some entries (marked premium=True)
# are LeetCode Premium problems that appear on the commonly circulated list.
B = lambda t, d, premium=False: (t, d, premium)
blind75 = {
    "Array": [B("Two Sum", "Easy"), B("Best Time to Buy and Sell Stock", "Easy"), B("Contains Duplicate", "Easy"),
              B("Product of Array Except Self", "Medium"), B("Maximum Subarray", "Medium"), B("Maximum Product Subarray", "Medium"),
              B("Find Minimum in Rotated Sorted Array", "Medium"), B("Search in Rotated Sorted Array", "Medium"),
              B("3Sum", "Medium"), B("Container With Most Water", "Medium")],
    "Binary": [B("Sum of Two Integers", "Medium"), B("Number of 1 Bits", "Easy"), B("Counting Bits", "Easy"),
               B("Missing Number", "Easy"), B("Reverse Bits", "Easy")],
    "Dynamic Programming": [B("Climbing Stairs", "Easy"), B("Coin Change", "Medium"), B("Longest Increasing Subsequence", "Medium"),
                            B("Longest Common Subsequence", "Medium"), B("Word Break", "Medium"), B("Combination Sum", "Medium"),
                            B("House Robber", "Medium"), B("House Robber II", "Medium"), B("Decode Ways", "Medium"),
                            B("Unique Paths", "Medium"), B("Jump Game", "Medium")],
    "Graph": [B("Clone Graph", "Medium"), B("Course Schedule", "Medium"), B("Pacific Atlantic Water Flow", "Medium"),
              B("Number of Islands", "Medium"), B("Longest Consecutive Sequence", "Medium"),
              B("Alien Dictionary", "Hard", True), B("Graph Valid Tree", "Medium", True),
              B("Number of Connected Components in an Undirected Graph", "Medium", True)],
    "Interval": [B("Insert Interval", "Medium"), B("Merge Intervals", "Medium"), B("Non-overlapping Intervals", "Medium"),
                 B("Meeting Rooms", "Easy", True), B("Meeting Rooms II", "Medium", True)],
    "Linked List": [B("Reverse Linked List", "Easy"), B("Linked List Cycle", "Easy"), B("Merge Two Sorted Lists", "Easy"),
                    B("Merge k Sorted Lists", "Hard"), B("Remove Nth Node From End of List", "Medium"), B("Reorder List", "Medium")],
    "Matrix": [B("Set Matrix Zeroes", "Medium"), B("Spiral Matrix", "Medium"), B("Rotate Image", "Medium"), B("Word Search", "Medium")],
    "String": [B("Longest Substring Without Repeating Characters", "Medium"), B("Longest Repeating Character Replacement", "Medium"),
               B("Minimum Window Substring", "Hard"), B("Valid Anagram", "Easy"), B("Group Anagrams", "Medium"),
               B("Valid Parentheses", "Easy"), B("Valid Palindrome", "Easy"), B("Longest Palindromic Substring", "Medium"),
               B("Palindromic Substrings", "Medium"), B("Encode and Decode Strings", "Medium", True)],
    "Tree": [B("Maximum Depth of Binary Tree", "Easy"), B("Same Tree", "Easy"), B("Invert Binary Tree", "Easy"),
             B("Binary Tree Maximum Path Sum", "Hard"), B("Binary Tree Level Order Traversal", "Medium"),
             B("Serialize and Deserialize Binary Tree", "Hard"), B("Subtree of Another Tree", "Easy"),
             B("Construct Binary Tree from Preorder and Inorder Traversal", "Medium"), B("Validate Binary Search Tree", "Medium"),
             B("Kth Smallest Element in a BST", "Medium"), B("Lowest Common Ancestor of a Binary Search Tree", "Medium"),
             B("Implement Trie (Prefix Tree)", "Medium"), B("Design Add and Search Words Data Structure", "Medium"),
             B("Word Search II", "Hard")],
    "Heap": [B("Top K Frequent Elements", "Medium"), B("Find Median from Data Stream", "Hard")],
}
assert sum(len(v) for v in blind75.values()) == 75

authored = {p["title"]: p["id"] for p in problems}
blind_topics, stubs = [], []
for cat, items in blind75.items():
    ids = []
    for title, diff, premium in items:
        if title in authored:
            pid = authored[title]
        else:
            pid = slug(title)
            stubs.append({"id": pid, "title": title, "difficulty": diff, "topic": cat, "premium": premium})
        ids.append(pid)
    blind_topics.append({"name": cat, "problems": ids})

roadmaps = [
    {"id": "python-foundations", "title": "Python Foundations", "difficulty": "Beginner",
     "description": "Start from zero. Learn Python syntax, control flow, functions and the core data types by solving small, focused problems.",
     "topics": by_topic(pf_topics, pf_ids)},
    {"id": "dsa-fundamentals", "title": "DSA Fundamentals", "difficulty": "Intermediate",
     "description": "Learn the core data structures and algorithmic patterns: hash maps, two pointers, sliding window, stacks, binary search, recursion and trees.",
     "topics": by_topic(dsa_topics, dsa_ids)},
    {"id": "blind-75", "title": "Blind 75", "difficulty": "Advanced",
     "description": "The widely used 75-problem interview preparation list, grouped by category. Practise explaining trade-offs, edge cases and complexity.",
     "topics": blind_topics},
]

(OUT / "problems").mkdir(parents=True, exist_ok=True)
for old in (OUT / "problems").glob("*.json"):
    old.unlink()
for p in problems:
    (OUT / "problems" / f"{p['id']}.json").write_text(json.dumps(p, indent=2) + "\n")
(OUT / "roadmaps.json").write_text(json.dumps(roadmaps, indent=2) + "\n")
(OUT / "unavailable-problems.json").write_text(json.dumps(stubs, indent=2) + "\n")
print(f"{len(problems)} executable problems, {len(stubs)} catalog-only problems, {len(roadmaps)} roadmaps")
