"""AI-assisted visualization: the model returns a JSON *spec* (which variables to draw how, plus short captions).

Hard rules enforced here, not just in the prompt:
  * the spec is parsed and validated against a strict schema; the model's output is never executed or rendered as markup
  * views may only reference variables that really appear in the trace
  * captions are filtered for code, markup and solution-hinting phrasing
  * one LLM call per (session, code version, test case, provider mode); repeats are served from the database
"""
from __future__ import annotations

import json
import logging
import re

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError, not_found
from app.models import CodingSession, Problem, User, Visualization
from app.prompts.socratic_tutor import DEFAULT_STYLE, ROADMAP_STYLE
from app.prompts.visualizer import VISUALIZER_SYSTEM
from app.schemas.visualize import CaptionOut, CompactTrace, VisualizeRequest, VisualizeResponse, VisualSpec
from app.services import progress as progress_service
from app.services import sessions as sessions_service
from app.services.tutor.context import neutralize, render_problem
from app.services.tutor.llm import LLMError, LLMProvider, LLMRequest

log = logging.getLogger("app.tutor.visualize")

_CODE_LIKE = re.compile(r"```|`|[<>]|\bdef\s+\w+\s*\(|^\s*(for|while|if|elif|else)\b.*:\s*$|\breturn\s+[\w\[\(\{\-]", re.IGNORECASE | re.MULTILINE)
# Phrasing that tells the student what to do / what the better algorithm is. A heuristic backstop for the prompt rules.
_SOLUTION_HINT = re.compile(
    r"\b(you should|you need to|you must|you could|you can use|instead,? (use|try)|a better (approach|way|solution)|"
    r"try using|consider using|use a (hash|dict|set|stack|queue|heap)|optimi[sz]e|the (correct|right|optimal) (approach|solution|algorithm)|"
    r"should be|should have|is wrong|is incorrect|bug is|rather than|instead of|instead|needs? to|has to|ought to|supposed to|"
    r"missing|forgot|forgotten|off[- ]by[- ]one|the (fix|issue|problem|mistake) (is|was)|correct (value|way|answer|index)|plus 1|minus 1)\b|[\w\)\]] [+-] \d|[\w\)\]][+-]\d", re.IGNORECASE)


def build_request(problem: Problem, roadmap_id: str | None, code: str, code_version: int, trace: CompactTrace, test_case_id: int,
                  *, max_tokens: int) -> LLMRequest:
    style = ROADMAP_STYLE.get(roadmap_id or "", DEFAULT_STYLE)
    problem_view = {"title": problem.title, "difficulty": problem.difficulty, "topic": problem.topic, "description": problem.description,
                    "examples": problem.examples, "constraints": problem.constraints, "function_signature": problem.function_signature}
    lines = []
    for st in trace.steps:
        shown = " ".join(f"{k}={v}" for k, v in st.vars.items()) or "(no variables)"
        lines.append(f"step {st.i} (line {st.line}): {shown}")
    err = f' error="{neutralize(trace.error)}"' if trace.error else ""
    body = "\n".join(lines)
    kinds = ", ".join(f"{k}:{v}" for k, v in trace.var_kinds.items()) or "(none)"
    user = "\n\n".join([
        f'<student_code version="{code_version}">\n{neutralize(code)}\n</student_code>',
        f'<trace test_case="{test_case_id}" total_steps="{trace.total_steps}" shown_steps="{len(trace.steps)}" '
        f'truncated="{str(trace.truncated).lower()}"{err}>\n{neutralize(body)}\n'
        f"result: {neutralize(trace.result)}\nexpected: {neutralize(trace.expected)}\n</trace>",
        f"<trace_variables>{neutralize(kinds)}</trace_variables>",
        '<request kind="visualize">Produce the JSON visualization spec now.</request>',
    ])
    return LLMRequest(system_stable=VISUALIZER_SYSTEM, system_context=f"{style}\n\n{render_problem(problem_view)}",
                      messages=[{"role": "user", "content": user}], max_tokens=max_tokens)


def extract_json(text: str) -> dict:
    t = text.strip()
    t = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", t)  # tolerate a fenced reply even though we asked for none
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    obj = json.loads(t[start:end + 1])
    if not isinstance(obj, dict):
        raise ValueError("reply is not an object")
    return obj


def _clean_text(text: str) -> str | None:
    t = " ".join(text.split())
    if not t or _CODE_LIKE.search(t) or _SOLUTION_HINT.search(t):
        return None
    return t


def sanitize_spec(spec: VisualSpec, trace: CompactTrace) -> tuple[VisualSpec, bool]:
    """Keep only views of variables that exist in the trace; drop unsafe captions. Returns (spec, captions_were_removed)."""
    known = {k for st in trace.steps for k in st.vars} | set(trace.var_kinds)
    views = []
    for v in spec.views:
        if v.var not in known:
            continue
        pointers = [p for p in (v.pointers or []) if p in known and p != v.var]
        views.append(v.model_copy(update={"pointers": pointers or None}))
    if not views:
        raise LLMError(502, "visualization_invalid", "The AI did not describe any variable that appears in the trace.")

    valid_steps = {st.i for st in trace.steps}
    captions: list[CaptionOut] = []
    removed = False
    seen: set[int] = set()
    for c in spec.captions:
        text = _clean_text(c.text)
        if text is None or c.step not in valid_steps or c.step in seen:
            removed = True
            continue
        seen.add(c.step)
        captions.append(CaptionOut(step=c.step, text=text))
    summary = _clean_text(spec.summary) if spec.summary else None
    if spec.summary and summary is None:
        removed = True
    captions.sort(key=lambda c: c.step)
    return VisualSpec(views=views[:6], captions=captions[:12], summary=summary), removed


def handle_visualize(db: Session, user: User, body: VisualizeRequest, settings: Settings, provider: LLMProvider) -> VisualizeResponse:
    cs: CodingSession = sessions_service.get_owned_session(db, body.session_id, user.id)
    problem = db.get(Problem, cs.problem_id)
    assert problem is not None
    if not any(t.get("id") == body.test_case_id for t in problem.test_cases):
        raise not_found("Test case not found", code="test_case_not_found")

    # Same contract as chat: bring the server's copy of the code up to date first. This is a save, never an LLM call.
    if body.code is not None and sessions_service.save_code(db, cs, body.code):
        progress_service.touch(db, user.id, cs.problem_id)
        db.commit()

    key = dict(coding_session_id=cs.id, code_version=cs.code_version, test_case_id=body.test_case_id, mode=provider.mode)
    cached = db.scalar(select(Visualization).filter_by(**key))
    if cached is not None:
        # Re-apply the CURRENT safety filter: a stored spec predates any later tightening of the rules.
        spec, removed = sanitize_spec(VisualSpec.model_validate(cached.spec), body.trace)
        return VisualizeResponse(spec=spec, cached=True, code_version=cs.code_version, tutor_mode=provider.mode,
                                 captions_removed=cached.captions_removed or removed)

    request = build_request(problem, cs.roadmap_id, cs.saved_code, cs.code_version, body.trace, body.test_case_id,
                            max_tokens=settings.llm_visualize_max_output_tokens)
    try:
        result = provider.complete(request)
    except LLMError as e:
        log.warning("visualize LLM call failed: %s", e.code)
        raise e.to_app_error() from e
    log.info("visualize reply session=%s v=%s test=%s in=%s out=%s cache_read=%s", cs.id, cs.code_version, body.test_case_id,
             result.input_tokens, result.output_tokens, result.cache_read_tokens)

    try:
        spec = VisualSpec.model_validate(extract_json(result.text))
        spec, removed = sanitize_spec(spec, body.trace)
    except LLMError as e:
        raise e.to_app_error() from e
    except (ValueError, ValidationError) as e:  # JSONDecodeError is a ValueError
        log.warning("visualize: invalid spec from model: %s", type(e).__name__)
        raise AppError(502, "visualization_invalid", "The AI returned a view that could not be used. The automatic view still works.") from e

    row = Visualization(**key, spec=spec.model_dump(mode="json", exclude_none=True), captions_removed=removed)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:  # a concurrent identical request stored it first; ours is equivalent
        db.rollback()
    return VisualizeResponse(spec=spec, cached=False, code_version=cs.code_version, tutor_mode=provider.mode, captions_removed=removed)
