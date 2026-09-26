"""Wire real adapters with their deterministic fallbacks. The pipeline never knows which one answered."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Protocol

from app.analytics.evidence import Candidate
from app.ai.jev import JevDecisionProvider
from app.ai.openrouter import OpenRouterExplanationProvider
from app.ai.ports import Decision, Explanation, ProviderError
from app.ai.rules import decide_by_rules, violates_guardrail
from app.ai.templates import explain_by_template
from app.config import Settings

log = logging.getLogger(__name__)


async def _call_with_retry(fn: Callable[[], Any], timeout: float) -> Any:
    """One attempt + one retry, only on retryable errors (timeout / 5xx / network)."""
    for attempt in (1, 2):
        try:
            return await asyncio.wait_for(fn(), timeout=timeout + 1)
        except asyncio.TimeoutError as e:
            err = ProviderError("timeout", retryable=True)
            err.__cause__ = e
        except ProviderError as e:
            err = e
        if not err.retryable or attempt == 2:
            raise err
        await asyncio.sleep(1)
    raise err  # pragma: no cover


class DecisionWithFallback:
    def __init__(self, primary: JevDecisionProvider | None, timeout: float):
        self.primary, self.timeout = primary, timeout
        self.name = "jev" if primary else "rules"

    async def decide(self, c: Candidate) -> Decision:
        if self.primary is None:
            return decide_by_rules(c, notes=["jev:no_api_key"])
        try:
            d = await _call_with_retry(lambda: self.primary.decide(c), self.timeout)
        except ProviderError as e:
            log.warning("%s: Jev failed (%s), using rules", c.meter_id, e.note)
            return decide_by_rules(c, notes=[f"jev:{e.note.split(':', 1)[-1]}"])
        g = violates_guardrail(c, d)
        if g:
            log.warning("%s: Jev said %s but %s, using rules", c.meter_id, d.type, g)
            rd = decide_by_rules(c, notes=[g, f"jev_said:{d.type}/{d.severity}"])
            rd.type_probabilities, rd.severity_probabilities, rd.priority_probability, rd.confidence_parts = (
                d.type_probabilities, d.severity_probabilities, d.priority_probability, d.confidence_parts)
            rd.latency_ms = d.latency_ms
            return rd
        return d


class ExplanationWithFallback:
    def __init__(self, primary: OpenRouterExplanationProvider | None, timeout: float):
        self.primary, self.timeout = primary, timeout
        self.name = "llm" if primary else "template"

    async def explain(self, c: Candidate, d: Decision) -> Explanation:
        if self.primary is None:
            return explain_by_template(c, d, notes=["llm:no_api_key"])
        try:
            return await _call_with_retry(lambda: self.primary.explain(c, d), self.timeout)
        except ProviderError as e:
            log.warning("%s: LLM failed (%s), using template", c.meter_id, e.note)
            return explain_by_template(c, d, notes=[e.note if e.note.startswith("llm:") else f"llm:{e.note}"])


class AiCache(Protocol):
    """Keyed by sha256(provider + evidence text). Implemented over SQLite in services; a dict in tests."""

    def get(self, key: str) -> dict | None: ...
    def set(self, key: str, value: dict, provider: str = "", meter_id: str = "") -> None: ...


def build_providers(s: Settings) -> tuple[DecisionWithFallback, ExplanationWithFallback]:
    jev = JevDecisionProvider(s.effective_jev_key, s.jev_base_url, s.jev_model, s.jev_timeout_seconds) if s.effective_jev_key else None
    llm = (OpenRouterExplanationProvider(s.openrouter_api_key, s.openrouter_base_url, s.llm_models, s.llm_timeout_seconds)
           if s.openrouter_api_key else None)
    return DecisionWithFallback(jev, s.jev_timeout_seconds), ExplanationWithFallback(llm, s.llm_timeout_seconds)

