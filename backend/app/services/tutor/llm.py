"""LLM provider abstraction. Add a provider by implementing `LLMProvider.complete` and registering it in `get_provider`."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Literal, Protocol

from app.core.config import Settings, get_settings
from app.core.errors import AppError

log = logging.getLogger("app.tutor.llm")


@dataclass(frozen=True)
class LLMRequest:
    system_stable: str  # byte-stable across requests -> cacheable
    system_context: str  # per problem/roadmap, stable within a session -> cacheable
    messages: list[dict[str, str]]
    max_tokens: int


@dataclass(frozen=True)
class LLMResponse:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    extra: dict = field(default_factory=dict)


class LLMError(Exception):
    def __init__(self, status: int, code: str, message: str, retry_after: int | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.retry_after = status, code, message, retry_after

    def to_app_error(self) -> AppError:
        headers = {"Retry-After": str(self.retry_after)} if self.retry_after else None
        return AppError(self.status, self.code, self.message, headers=headers)


class LLMProvider(Protocol):
    mode: Literal["live", "mock"]

    def complete(self, request: LLMRequest) -> LLMResponse: ...


class AnthropicProvider:
    mode = "live"

    def __init__(self, settings: Settings, client=None):  # noqa: ANN001  (client injectable for tests)
        import anthropic  # imported lazily so mock mode needs no network libs

        self._anthropic = anthropic
        self._model = settings.llm_model
        self._caching = settings.llm_prompt_caching
        self._client = client or anthropic.Anthropic(api_key=settings.llm_api_key, timeout=settings.llm_timeout_seconds, max_retries=1)

    def complete(self, request: LLMRequest) -> LLMResponse:
        a = self._anthropic
        cc = {"cache_control": {"type": "ephemeral"}} if self._caching else {}
        # Prefix order: static instructions, then per-problem context, then the conversation.
        # Breakpoints on both system blocks: a cache hit needs the prefix to reach the provider's minimum cacheable length.
        system = [
            {"type": "text", "text": request.system_stable, **cc},
            {"type": "text", "text": request.system_context, **cc},
        ]
        try:
            resp = self._client.messages.create(
                model=self._model,
                max_tokens=request.max_tokens,
                system=system,
                messages=request.messages,
                output_config={"effort": "low"},  # short tutoring replies; keeps latency and cost down
            )
        except a.RateLimitError as e:
            retry = int(e.response.headers.get("retry-after", "30")) if e.response is not None else 30
            raise LLMError(429, "llm_rate_limited", "The AI tutor is busy right now. Try again in a moment.", retry) from e
        except (a.AuthenticationError, a.PermissionDeniedError, a.NotFoundError) as e:
            log.error("LLM misconfigured (%s): %s", type(e).__name__, e)  # key/model problems are operator errors
            raise LLMError(503, "llm_misconfigured", "The AI tutor is not configured correctly. Please contact the administrator.") from e
        except a.BadRequestError as e:
            log.error("LLM rejected request: %s", e)
            raise LLMError(502, "llm_bad_request", "The AI tutor could not process that request.") from e
        except (a.APIConnectionError, a.APITimeoutError) as e:  # APITimeoutError subclasses APIConnectionError
            raise LLMError(503, "llm_unavailable", "Could not reach the AI tutor. Check your connection and try again.") from e
        except a.APIStatusError as e:
            log.error("LLM upstream error %s: %s", e.status_code, e)
            raise LLMError(503, "llm_unavailable", "The AI tutor is temporarily unavailable. Please try again.") from e

        if resp.stop_reason == "refusal":
            raise LLMError(422, "llm_declined", "The AI tutor declined to answer that. Try rephrasing your question.")
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        if not text:
            raise LLMError(502, "llm_empty", "The AI tutor returned an empty reply. Please try again.")
        u = resp.usage
        return LLMResponse(
            text=text, input_tokens=u.input_tokens, output_tokens=u.output_tokens,
            cache_read_tokens=getattr(u, "cache_read_input_tokens", None),
            cache_write_tokens=getattr(u, "cache_creation_input_tokens", None),
            extra={"truncated": resp.stop_reason == "max_tokens", "request_id": getattr(resp, "_request_id", None)},
        )


MOCK_BANNER = "🛠️ **Development mock tutor, not AI.** Set `LLM_PROVIDER=anthropic` with an API key for real guidance."


class MockProvider:
    """Deterministic canned replies so the rest of the app can be exercised without an API key."""

    mode = "mock"

    def _visualize(self, prompt: str) -> LLMResponse:
        text = json.dumps(_mock_visualize_spec(prompt))
        return LLMResponse(text=text, input_tokens=len(prompt) // 4, output_tokens=len(text) // 4)

    def complete(self, request: LLMRequest) -> LLMResponse:
        last = request.messages[-1]["content"]
        if '<request kind="visualize"' in last:
            return self._visualize(last)
        if "stage: solved" in last and '<request kind="hint"' not in last:
            body = "All tests pass. What is the time complexity of your solution, and what do you count to get it?"
        elif '<request kind="hint"' in last:
            body = "What is the simplest example input you can trace by hand, and what does your code do at each step?"
        elif '<request kind="review"' in last:
            body = "Can you describe your approach in one sentence, and what would happen on an empty or one-element input?"
        else:
            body = "Good question. What have you tried so far, and what did you expect to happen versus what actually happened?"
        approx_in = sum(len(m["content"]) for m in request.messages) // 4
        return LLMResponse(text=f"{MOCK_BANNER}\n\n{body}", input_tokens=approx_in, output_tokens=len(body) // 4)


def _mock_visualize_spec(prompt: str) -> dict:
    """Deterministic, valid spec built only from the variable list in the prompt: lets the whole feature be tested without an API key."""
    m = re.search(r"<trace_variables>(.*?)</trace_variables>", prompt, re.S)
    pairs = [p.strip().split(":") for p in (m.group(1) if m else "").split(",") if ":" in p]
    pointer_re = re.compile(r"^(i|j|k|l|r|lo|hi|low|high|left|right|mid|start|end|idx|index|p|q|slow|fast|pos|cur|curr)$", re.I)
    views, pointers = [], [n.strip() for n, k in pairs if k.strip() == "int" and pointer_re.match(n.strip())]
    for name, kind in ((n.strip(), k.strip()) for n, k in pairs):
        view = {"list": "array", "str": "string", "dict": "map", "set": "map", "tree": "tree"}.get(kind)
        if view:
            views.append({"var": name, "kind": view})
    seq = next((v for v in views if v["kind"] in ("array", "string")), None)
    if seq and pointers:
        seq["pointers"] = pointers[:6]
    if not views and pairs:
        views = [{"var": pairs[0][0].strip(), "kind": "scalar"}]
    steps = [int(x) for x in re.findall(r"^step (\d+) ", prompt, re.M)]
    captions = []
    if steps:
        captions.append({"step": steps[0], "text": "(mock) The function starts here. What do the inputs look like?"})
        if len(steps) > 1:
            captions.append({"step": steps[-1], "text": "(mock) The function finished. How does the result compare with what the test expected?"})
    return {"views": views[:6], "captions": captions, "summary": "Development mock: captions are placeholders, not written by an AI model."}


def get_provider(settings: Settings | None = None) -> LLMProvider:
    s = settings or get_settings()
    if s.llm_provider == "anthropic":
        return AnthropicProvider(s)
    return MockProvider()


def tutor_mode(settings: Settings) -> Literal["live", "mock"]:
    return "live" if settings.llm_provider != "mock" else "mock"
