from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.catalog import Status


MAX_CODE_CHARS = 20000


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    problem_id: str = Field(min_length=1, max_length=100)
    roadmap_id: str | None = Field(default=None, max_length=64)


class CodeSave(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(max_length=MAX_CODE_CHARS)


class CodeSaveOut(BaseModel):
    code_version: int
    changed: bool
    updated_at: datetime


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: Literal["user", "assistant"]
    kind: Literal["chat", "hint", "review"]
    content: str
    created_at: datetime


class FailureDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")
    test_id: int = Field(ge=0)
    input: str = Field(max_length=500)
    expected: str = Field(max_length=500)
    actual: str = Field(default="", max_length=500)
    error: str = Field(default="", max_length=800)


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code_version: int
    passed_tests: int
    total_tests: int
    execution_status: Literal["passed", "failed", "error", "timeout"]
    created_at: datetime


class SessionOut(BaseModel):
    id: str
    problem_id: str
    roadmap_id: str | None
    saved_code: str
    code_version: int
    updated_at: datetime
    messages: list[ChatMessageOut]
    last_submission: SubmissionOut | None
    hint_level: int
    tutor_mode: Literal["live", "mock"]


class SubmissionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    code: str | None = Field(default=None, max_length=MAX_CODE_CHARS, description="Code that was run; synced like a save if it differs")
    passed_tests: int = Field(ge=0, le=1000)
    total_tests: int = Field(ge=0, le=1000)
    execution_status: Literal["passed", "failed", "error", "timeout"]
    failures: list[FailureDetail] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def _counts(self) -> SubmissionCreate:
        if self.passed_tests > self.total_tests:
            raise ValueError("passed_tests cannot exceed total_tests")
        return self


class SubmissionResult(BaseModel):
    submission: SubmissionOut
    code_version: int
    completion_status: Status
    attempts: int


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    kind: Literal["chat", "hint", "review"] = "chat"
    message: str | None = Field(default=None, max_length=2000)
    code: str | None = Field(default=None, max_length=MAX_CODE_CHARS, description="Send when the editor differs from the saved code")

    @model_validator(mode="after")
    def _need_message(self) -> ChatRequest:
        if self.kind == "chat" and not (self.message and self.message.strip()):
            raise ValueError("message is required for kind='chat'")
        return self


class ChatResponse(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    code_version: int
    hint_level: int
    tutor_mode: Literal["live", "mock"]


class ProgressItem(BaseModel):
    problem_id: str
    title: str
    difficulty: str
    status: Status
    attempts: int
    last_attempted_at: datetime | None
    completed_at: datetime | None
    roadmap_id: str | None


class ProgressOut(BaseModel):
    total_available: int
    completed: int
    in_progress: int
    problems: list[ProgressItem]
    recent: list[ProgressItem]
