"""Request/response models for the AI visualization. The AI returns DATA only: a spec made of these fields, nothing executable."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.learning import MAX_CODE_CHARS

IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}$")
VIEW_KINDS = ("array", "string", "map", "stack", "list", "tree", "scalar")
VAR_KINDS = ("int", "float", "bool", "none", "str", "list", "set", "dict", "tree", "obj")
ViewKind = Literal["array", "string", "map", "stack", "list", "tree", "scalar"]
_NO_MARKUP = re.compile(r"[<>]|```")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _ident(v: str) -> str:
    if not IDENT.match(v):
        raise ValueError("must be a plain identifier")
    return v


# ---- request ----------------------------------------------------------------
class TraceStepIn(_Strict):
    i: int = Field(ge=0, le=100_000)
    line: int = Field(ge=0, le=100_000)
    vars: dict[str, str] = Field(max_length=8)

    @field_validator("vars")
    @classmethod
    def _vars(cls, v: dict[str, str]) -> dict[str, str]:
        for k, val in v.items():
            _ident(k)
            if len(val) > 80:
                raise ValueError("variable value too long")
        return v


class CompactTrace(_Strict):
    steps: list[TraceStepIn] = Field(min_length=1, max_length=60)
    total_steps: int = Field(ge=1, le=100_000)
    truncated: bool = False
    error: str | None = Field(default=None, max_length=300)
    result: str = Field(max_length=200)
    expected: str = Field(max_length=200)
    var_kinds: dict[str, str] = Field(default_factory=dict, max_length=12)

    @field_validator("var_kinds")
    @classmethod
    def _kinds(cls, v: dict[str, str]) -> dict[str, str]:
        for k, kind in v.items():
            _ident(k)
            if kind not in VAR_KINDS:
                raise ValueError("unknown variable kind")
        return v


class VisualizeRequest(_Strict):
    session_id: str
    test_case_id: int = Field(ge=0, le=10_000)
    code: str | None = Field(default=None, max_length=MAX_CODE_CHARS)
    trace: CompactTrace


# ---- the spec the AI produces and the client renders -----------------------------
class ViewSpecOut(_Strict):
    var: str
    kind: ViewKind
    pointers: list[str] | None = Field(default=None, max_length=6)
    title: str | None = Field(default=None, max_length=60)

    @field_validator("var")
    @classmethod
    def _v(cls, v: str) -> str:
        return _ident(v)

    @field_validator("pointers")
    @classmethod
    def _p(cls, v: list[str] | None) -> list[str] | None:
        return [_ident(x) for x in v] if v else v

    @field_validator("title")
    @classmethod
    def _t(cls, v: str | None) -> str | None:
        if v and _NO_MARKUP.search(v):
            raise ValueError("no markup allowed")
        return v


class CaptionOut(_Strict):
    step: int = Field(ge=0, le=100_000)
    text: str = Field(min_length=1, max_length=160)


class VisualSpec(_Strict):
    views: list[ViewSpecOut] = Field(min_length=1, max_length=6)
    captions: list[CaptionOut] = Field(default_factory=list, max_length=40)
    summary: str | None = Field(default=None, max_length=300)


class VisualizeResponse(BaseModel):
    spec: VisualSpec
    cached: bool
    code_version: int
    tutor_mode: Literal["live", "mock"]
    captions_removed: bool
