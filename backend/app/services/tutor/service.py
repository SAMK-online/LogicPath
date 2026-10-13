from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import ChatMessage, CodingSession, Problem, Submission, User
from app.schemas.learning import ChatMessageOut, ChatRequest, ChatResponse
from app.services import progress as progress_service
from app.services import sessions as sessions_service
from app.services.tutor.context import MAX_HINT_LEVEL, ChatTurn, TutorInput, build_request, guard_against_solution_leak
from app.services.tutor.llm import LLMError, LLMProvider

log = logging.getLogger("app.tutor")
USER_TEXT = {"hint": "Request Hint", "review": "Review My Approach"}


def _last_run(db: Session, cs: CodingSession) -> dict | None:
    sub = db.scalar(select(Submission).where(Submission.coding_session_id == cs.id).order_by(Submission.id.desc()).limit(1))
    if sub is None:
        return None
    return {"status": sub.execution_status, "passed": sub.passed_tests, "total": sub.total_tests,
            "code_version": sub.code_version, "failures": sub.failures or []}


def handle_chat(db: Session, user: User, body: ChatRequest, settings: Settings, provider: LLMProvider) -> ChatResponse:
    cs = sessions_service.get_owned_session(db, body.session_id, user.id)

    # 1) Sync editor -> DB first so the tutor never discusses stale code. This is a save, not an LLM call, and it
    #    is committed even if the LLM call below fails.
    if body.code is not None and sessions_service.save_code(db, cs, body.code):
        progress_service.touch(db, user.id, cs.problem_id)
        db.commit()

    problem = db.get(Problem, cs.problem_id)
    assert problem is not None
    state = dict(cs.learning_state or {})
    hint_level = int(state.get("hint_level", 0))
    hints_used = int(state.get("hints_used", 0))
    if body.kind == "hint":
        hint_level = min(hint_level + 1, MAX_HINT_LEVEL)  # escalates only on explicit hint requests
        hints_used += 1

    # 2) Recent history (bounded) + counts for the digest.
    limit = settings.chat_history_limit
    recent = list(reversed(db.scalars(
        select(ChatMessage).where(ChatMessage.coding_session_id == cs.id).order_by(ChatMessage.id.desc()).limit(limit)).all()))
    total_prior = db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.coding_session_id == cs.id)) or 0
    questions = db.scalar(select(func.count()).select_from(ChatMessage).where(
        ChatMessage.coding_session_id == cs.id, ChatMessage.role == "user")) or 0

    user_text = (body.message or "").strip() if body.kind == "chat" else USER_TEXT[body.kind]
    inp = TutorInput(
        kind=body.kind, roadmap_id=cs.roadmap_id,
        problem={"title": problem.title, "difficulty": problem.difficulty, "topic": problem.topic,
                 "description": problem.description, "examples": problem.examples, "constraints": problem.constraints,
                 "function_signature": problem.function_signature},
        code=cs.saved_code, code_version=cs.code_version,
        history=[ChatTurn(m.role, m.content) for m in recent], total_prior_messages=total_prior,
        prior_user_questions=questions, message=user_text, hint_level=hint_level, hints_used=hints_used,
        last_run=_last_run(db, cs),
    )
    request = build_request(inp, max_tokens=settings.llm_max_output_tokens)

    # 3) Call the LLM. Nothing chat-related is persisted unless this succeeds.
    try:
        result = provider.complete(request)
    except LLMError as e:
        log.warning("LLM call failed: %s (%s)", e.code, e.message)
        raise e.to_app_error() from e

    reply, leaked = guard_against_solution_leak(result.text, (problem.function_signature or {}).get("name"))
    if result.extra.get("truncated") and not leaked:
        reply += " …"
    log.info("tutor reply kind=%s session=%s v=%s in=%s out=%s cache_read=%s cache_write=%s leak_guard=%s",
             body.kind, cs.id, cs.code_version, result.input_tokens, result.output_tokens,
             result.cache_read_tokens, result.cache_write_tokens, leaked)

    # 4) Persist the exchange + compact learning state.
    um = ChatMessage(coding_session_id=cs.id, role="user", kind=body.kind, content=user_text, code_version=cs.code_version)
    am = ChatMessage(coding_session_id=cs.id, role="assistant", kind=body.kind, content=reply, code_version=cs.code_version,
                     input_tokens=result.input_tokens, output_tokens=result.output_tokens)
    db.add_all([um, am])
    state.update(hint_level=hint_level, hints_used=hints_used)
    cs.learning_state = state
    progress_service.touch(db, user.id, cs.problem_id)
    db.commit()
    return ChatResponse(user_message=ChatMessageOut.model_validate(um), assistant_message=ChatMessageOut.model_validate(am),
                        code_version=cs.code_version, hint_level=hint_level, tutor_mode=provider.mode)
