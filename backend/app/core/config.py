from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["development", "test", "production"] = "development"
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'data' / 'socratic.db'}"
    frontend_origin: str = "http://localhost:5180,http://127.0.0.1:5180"  # comma-separated list allowed

    # Required, no default: a hard-coded fallback secret would be an insecure credential.
    session_secret: str = Field(min_length=32)
    session_ttl_hours: int = 24 * 7
    cookie_name: str = "sdt_session"
    cookie_secure: bool = False  # set true in production (HTTPS)
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"  # "none" requires cookie_secure

    # Rate limits: "<count>/<window seconds>"
    rate_limit_enabled: bool = True
    auth_rate_limit: str = "10/60"
    chat_rate_limit: str = "20/60"

    # LLM
    llm_provider: Literal["anthropic", "mock"] = "mock"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_timeout_seconds: float = 45.0
    llm_visualize_max_output_tokens: int = 3500  # the spec is JSON with up to 40 captions
    llm_max_output_tokens: int = 2048  # includes thinking tokens; replies are kept short by the prompt
    llm_prompt_caching: bool = True
    chat_history_limit: int = Field(default=8, ge=2, le=20)

    fixtures_dir: Path = REPO_ROOT / "shared" / "problem-fixtures"

    @field_validator("session_secret")
    @classmethod
    def _secret_not_placeholder(cls, v: str) -> str:
        if v.lower().startswith("change-me"):
            raise ValueError("SESSION_SECRET is still the placeholder from .env.example; generate a real one")
        return v

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    def validate_for_runtime(self) -> None:
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
        if self.is_production and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production")
        if self.llm_provider == "anthropic" and not (self.llm_api_key and self.llm_model):
            raise ValueError(f"LLM_API_KEY and LLM_MODEL are required when LLM_PROVIDER={self.llm_provider} (use LLM_PROVIDER=mock for dev)")


@lru_cache
def get_settings() -> Settings:
    s = Settings()  # type: ignore[call-arg]
    s.validate_for_runtime()
    return s
