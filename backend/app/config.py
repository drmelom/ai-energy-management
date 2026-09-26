from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./energy.db"
    data_dir: Path = Path("./data")

    # Decision provider (Jev). Default route: OpenRouter's TypeSafe-compatible endpoint.
    jev_base_url: str = "https://openrouter.ai/api"
    jev_model: str = "typesafe/jev-1.13"
    jev_api_key: str | None = None  # falls back to openrouter_api_key
    jev_timeout_seconds: float = 10

    # Explanation provider (LLM via OpenRouter, OpenAI-compatible)
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_models: Annotated[list[str], NoDecode] = [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "qwen/qwen3.8-27b:free",
        "dots-studio/dots-3-note-preview:free",
    ]
    llm_timeout_seconds: float = 30
    analysis_timeout_seconds: float = 120

    demo_user: str = "admin"
    demo_password: str = "admin"

    @field_validator("cors_origins", "llm_models", mode="before")
    @classmethod
    def _split_csv(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def effective_jev_key(self) -> str | None:
        return self.jev_api_key or self.openrouter_api_key or None

    @property
    def decision_mode(self) -> str:
        return "jev" if self.effective_jev_key else "rules"

    @property
    def explanation_mode(self) -> str:
        return "llm" if self.openrouter_api_key else "template"


@lru_cache
def get_settings() -> Settings:
    return Settings()
