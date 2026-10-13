from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, current_user
from app.core.config import Settings, get_settings
from app.core.rate_limit import rate_limit
from app.db.session import get_db
from app.schemas.learning import (ChatRequest, ChatResponse, CodeSave, CodeSaveOut, ProgressOut, SessionCreate, SessionOut,
                                  SubmissionCreate, SubmissionResult)
from app.services import progress as progress_service
from app.services import sessions as sessions_service
from app.services import submissions as submissions_service
from app.schemas.visualize import VisualizeRequest, VisualizeResponse
from app.services.tutor import service as tutor_service
from app.services.tutor import visualize as visualize_service
from app.services.tutor.llm import LLMProvider, get_provider

router = APIRouter(tags=["learning"])


def _provider(settings: Settings = Depends(get_settings)) -> LLMProvider:  # overridable in tests
    return get_provider(settings)


def _user_key(request) -> str:  # noqa: ANN001
    # Authenticated routes are limited per user, not per IP (shared NATs, classrooms).
    from app.core.config import get_settings as gs
    return request.cookies.get(gs().cookie_name, "anon")[:16] + ":" + (request.client.host if request.client else "?")


@router.post("/sessions", response_model=SessionOut)
def open_session(body: SessionCreate, response: Response, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    cs, created = sessions_service.get_or_create(db, cu.user.id, body.problem_id, body.roadmap_id)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return sessions_service.to_out(db, cs)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return sessions_service.to_out(db, sessions_service.get_owned_session(db, session_id, cu.user.id))


@router.put("/sessions/{session_id}/code", response_model=CodeSaveOut)
def save_code(session_id: str, body: CodeSave, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """Persists code only. Never calls the LLM."""
    cs = sessions_service.get_owned_session(db, session_id, cu.user.id)
    changed = sessions_service.save_code(db, cs, body.code)
    if changed:
        progress_service.touch(db, cu.user.id, cs.problem_id)
    db.commit()
    return CodeSaveOut(code_version=cs.code_version, changed=changed, updated_at=cs.updated_at)


@router.post("/chat", response_model=ChatResponse,
             dependencies=[Depends(rate_limit("chat", "chat_rate_limit", _user_key))])
def chat(body: ChatRequest, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db),
         settings: Settings = Depends(get_settings), provider: LLMProvider = Depends(_provider)):
    return tutor_service.handle_chat(db, cu.user, body, settings, provider)


@router.get("/progress", response_model=ProgressOut)
def progress(cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return progress_service.get_progress(db, cu.user.id)


@router.post("/submissions", response_model=SubmissionResult, status_code=status.HTTP_201_CREATED)
def submit(body: SubmissionCreate, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """Stores a CLIENT-REPORTED test run for analytics and progress. Not tamper-proof grading."""
    return submissions_service.record_submission(db, cu.user, body)


@router.post("/visualize", response_model=VisualizeResponse, response_model_exclude_none=True,
             dependencies=[Depends(rate_limit("chat", "chat_rate_limit", _user_key))])
def visualize(body: VisualizeRequest, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db),
              settings: Settings = Depends(get_settings), provider: LLMProvider = Depends(_provider)):
    """AI picks how to draw a client-recorded trace and writes short captions. Returns a validated JSON spec, never code."""
    return visualize_service.handle_visualize(db, cu.user, body, settings, provider)
