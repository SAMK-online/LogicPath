"""Pure functions that turn DB state into an LLM request. No I/O, so they are easy to unit test.

Token budget rules:
  * only the last `history_limit` chat messages are sent, plus a one-line digest of anything older (no extra LLM call)
  * only the CURRENT saved code is sent, never old snapshots
  * reference solutions are never loaded here (the fixtures don't contain any)
  * the system prompt and per-problem block are stable, so provider prompt caching can reuse them
"""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.prompts.socratic_tutor import DEFAULT_STYLE, HINT_LEVEL_LABELS, ROADMAP_STYLE, SYSTEM_PROMPT
from app.services.tutor.llm import LLMRequest

MAX_HINT_LEVEL = 5
_PROTECTED_TAGS = ("student_code", "student_message", "latest_test_run", "learning_state", "request", "problem", "trace_variables", "trace")
_TAG_RE = re.compile(r"<(/?)\s*(" + "|".join(_PROTECTED_TAGS) + r")\b", re.IGNORECASE)


def neutralize(text: str) -> str:
    """Stop untrusted text from closing/opening our delimiter tags (e.g. a code comment containing </student_code>)."""
    return _TAG_RE.sub(lambda m: f"<​{m.group(1)}{m.group(2)}", text)


@dataclass(frozen=True)
class ChatTurn:
    role: str
    content: str


@dataclass(frozen=True)
class TutorInput:
    kind: str  # chat | hint | review
    roadmap_id: str | None
    problem: dict[str, Any]  # title, difficulty, topic, description, examples, constraints, function_signature
    code: str
    code_version: int
    history: Sequence[ChatTurn]  # oldest -> newest, EXCLUDING the current message
    total_prior_messages: int
    prior_user_questions: int
    message: str | None
    hint_level: int  # level for THIS request when kind == "hint", else the current level
    hints_used: int
    last_run: dict[str, Any] | None  # {status, passed, total, code_version, failures:[...]}


def render_problem(p: dict[str, Any]) -> str:
    sig = p.get("function_signature") or {}
    params = ", ".join(f"{x['name']}: {x['type']}" for x in sig.get("params", []))
    lines = [f"<problem>", f"Title: {p['title']} ({p['difficulty']}, topic: {p['topic']})",
             f"Required function: {sig.get('name', '?')}({params}) -> {sig.get('return_type', '?')}", "", p["description"].strip()]
    for i, e in enumerate(p.get("examples", []), 1):
        lines.append(f"Example {i}: input {e['input']} -> output {e['output']}" + (f" ({e['explanation']})" if e.get("explanation") else ""))
    if p.get("constraints"):
        lines.append("Constraints: " + "; ".join(p["constraints"]))
    lines.append("</problem>")
    return "\n".join(lines)


def render_last_run(run: dict[str, Any] | None, current_version: int) -> str:
    if not run:
        return "No test run recorded yet."
    stale = "" if run["code_version"] == current_version else f" (ran on an earlier code version {run['code_version']}; code has changed since)"
    out = [f"Status: {run['status']}, {run['passed']}/{run['total']} tests passed{stale}."]
    for f in run.get("failures", [])[:3]:
        line = f"- test {f['test_id']}: input {f['input']} expected {f['expected']}"
        line += f" got {f['actual']}" if f.get("actual") else ""
        line += f" error: {f['error']}" if f.get("error") else ""
        out.append(neutralize(line))
    return "\n".join(out)


def session_stage(run: dict[str, Any] | None, current_version: int) -> str:
    """'solved' when every test passed on the code as it is now; otherwise 'solving'. Decided here, not by the model."""
    if run and run["status"] == "passed" and run["total"] > 0 and run["passed"] == run["total"] and run["code_version"] == current_version:
        return "solved"
    return "solving"


def history_digest(total_prior: int, kept: int, user_questions: int, hints_used: int) -> str | None:
    older = total_prior - kept
    if older <= 0:
        return None
    return (f"[Earlier in this session {older} older messages are omitted to save space; the student has asked "
            f"{user_questions} questions in total and used {hints_used} hints.]")


def build_request(inp: TutorInput, *, max_tokens: int) -> LLMRequest:
    style = ROADMAP_STYLE.get(inp.roadmap_id or "", DEFAULT_STYLE)
    system_context = f"{style}\n\n{render_problem(inp.problem)}"

    # History: must start with a user turn for the API.
    hist = list(inp.history)
    while hist and hist[0].role != "user":
        hist.pop(0)
    messages: list[dict[str, str]] = [{"role": t.role, "content": neutralize(t.content)} for t in hist]

    digest = history_digest(inp.total_prior_messages, len(hist), inp.prior_user_questions, inp.hints_used)
    parts: list[str] = []
    if digest:
        parts.append(digest)
    parts.append(f"<learning_state>\nhints_used: {inp.hints_used}\ncurrent_hint_level: {inp.hint_level}\ncode_version: {inp.code_version}\nstage: {session_stage(inp.last_run, inp.code_version)}\n</learning_state>")
    code = inp.code if inp.code.strip() else "(the editor is empty)"
    parts.append(f'<student_code version="{inp.code_version}">\n{neutralize(code)}\n</student_code>')
    parts.append(f"<latest_test_run>\n{render_last_run(inp.last_run, inp.code_version)}\n</latest_test_run>")
    if inp.kind == "hint":
        parts.append(f'<request kind="hint" level="{inp.hint_level}">Give a {HINT_LEVEL_LABELS[inp.hint_level]} hint.</request>')
    elif inp.kind == "review":
        parts.append('<request kind="review">Review the student\'s approach as described in your instructions.</request>')
    else:
        parts.append('<request kind="chat">Answer the student\'s message below.</request>')
        parts.append(f"<student_message>\n{neutralize(inp.message or '')}\n</student_message>")
    messages.append({"role": "user", "content": "\n\n".join(parts)})
    return LLMRequest(system_stable=SYSTEM_PROMPT, system_context=system_context, messages=messages, max_tokens=max_tokens)


_FENCE_RE = re.compile(r"```[a-zA-Z0-9_+-]*\n(.*?)```", re.DOTALL)
LEAK_REPLACEMENT = ("I started writing out code there, and handing you the implementation would take away the part where you learn. "
                    "Let's go back to your approach: what do you expect your code to do on the first example, step by step?")


def guard_against_solution_leak(reply: str, function_name: str | None) -> tuple[str, bool]:
    """Defence in depth on top of the prompt. Blocks replies that contain a long fenced block or define the target function.

    This is a heuristic, not a guarantee: a model can still describe an algorithm line by line in prose.
    """
    for m in _FENCE_RE.finditer(reply):
        block = m.group(1)
        long = len([ln for ln in block.splitlines() if ln.strip()]) > 8
        defines = bool(function_name) and re.search(rf"\bdef\s+{re.escape(function_name)}\s*\(", block) is not None
        if long or (defines and "return" in block):
            return LEAK_REPLACEMENT, True
    return reply, False
