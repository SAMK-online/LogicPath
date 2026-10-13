"""AnthropicProvider against a fake HTTP transport: verifies the request we send and how failures are mapped. No network, no key."""
import anthropic
import httpx2 as httpx
import pytest

from app.core.config import get_settings
from app.services.tutor.llm import AnthropicProvider, LLMError, LLMRequest, MockProvider, get_provider

REQ = LLMRequest(system_stable="STABLE", system_context="CONTEXT", messages=[{"role": "user", "content": "hi"}], max_tokens=777)


def provider(handler, **overrides):
    s = get_settings().model_copy(update={"llm_provider": "anthropic", "llm_api_key": "test-key", "llm_model": "claude-test", **overrides})
    client = anthropic.Anthropic(api_key="test-key", max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    return AnthropicProvider(s, client=client)


def ok_body(text="What do you think?", stop="end_turn", **usage):
    return {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-test", "stop_reason": stop, "stop_sequence": None,
            "content": [{"type": "text", "text": text}],
            "usage": {"input_tokens": 100, "output_tokens": 20, **usage}}


def test_request_shape_and_usage_parsing():
    seen = {}

    def handler(request):
        import json
        seen["body"] = json.loads(request.content)
        seen["key"] = request.headers.get("x-api-key")
        return httpx.Response(200, json=ok_body(cache_read_input_tokens=80, cache_creation_input_tokens=0))

    r = provider(handler).complete(REQ)
    b = seen["body"]
    assert seen["key"] == "test-key" and b["model"] == "claude-test" and b["max_tokens"] == 777
    assert [blk["text"] for blk in b["system"]] == ["STABLE", "CONTEXT"]
    assert all(blk["cache_control"] == {"type": "ephemeral"} for blk in b["system"])  # prompt caching on
    assert b["output_config"] == {"effort": "low"}
    assert b["messages"] == [{"role": "user", "content": "hi"}]
    for forbidden in ("temperature", "top_p", "top_k", "budget_tokens", "thinking"):
        assert forbidden not in b  # removed/rejected on current models
    assert (r.text, r.input_tokens, r.output_tokens, r.cache_read_tokens) == ("What do you think?", 100, 20, 80)


def test_prompt_caching_can_be_disabled():
    seen = {}

    def handler(request):
        import json
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=ok_body())

    provider(handler, llm_prompt_caching=False).complete(REQ)
    assert all("cache_control" not in blk for blk in seen["body"]["system"])


@pytest.mark.parametrize("status,code,http", [
    (429, "llm_rate_limited", 429), (401, "llm_misconfigured", 503), (404, "llm_misconfigured", 503),
    (500, "llm_unavailable", 503), (529, "llm_unavailable", 503), (400, "llm_bad_request", 502),
])
def test_http_errors_map_to_safe_app_errors(status, code, http):
    def handler(request):
        return httpx.Response(status, headers={"retry-after": "9"}, json={"type": "error", "error": {"type": "x", "message": "secret-internal-detail sk-ant-xyz"}})

    with pytest.raises(LLMError) as e:
        provider(handler).complete(REQ)
    assert (e.value.code, e.value.status) == (code, http)
    assert "secret-internal-detail" not in e.value.message and "sk-ant" not in e.value.message  # never leak provider text/keys
    if status == 429:
        assert e.value.retry_after == 9


def test_connection_failure_is_unavailable():
    def handler(request):
        raise httpx.ConnectError("no route")

    with pytest.raises(LLMError) as e:
        provider(handler).complete(REQ)
    assert e.value.code == "llm_unavailable"


def test_refusal_and_empty_replies():
    with pytest.raises(LLMError) as e:
        provider(lambda r: httpx.Response(200, json=ok_body(stop="refusal"))).complete(REQ)
    assert e.value.code == "llm_declined"
    with pytest.raises(LLMError) as e:
        provider(lambda r: httpx.Response(200, json=ok_body(text="  "))).complete(REQ)
    assert e.value.code == "llm_empty"


def test_truncation_is_flagged():
    r = provider(lambda r: httpx.Response(200, json=ok_body(stop="max_tokens"))).complete(REQ)
    assert r.extra["truncated"] is True


def test_provider_selection_and_config_validation():
    s = get_settings()
    assert isinstance(get_provider(s.model_copy(update={"llm_provider": "mock"})), MockProvider)
    with pytest.raises(ValueError, match="LLM_API_KEY"):
        s.model_copy(update={"llm_provider": "anthropic", "llm_api_key": "", "llm_model": ""}).validate_for_runtime()
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        s.model_copy(update={"env": "production", "cookie_secure": False}).validate_for_runtime()
    with pytest.raises(ValueError, match="COOKIE_SAMESITE"):
        s.model_copy(update={"cookie_samesite": "none", "cookie_secure": False}).validate_for_runtime()
