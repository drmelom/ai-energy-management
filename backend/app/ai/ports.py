"""The only abstraction boundary in the backend: who decides, who explains.

Two Protocols, two real adapters (Jev, LLM) and two deterministic fallbacks
(rules, templates). Everything else in the app is plain layered code.
"""
from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.analytics.evidence import Candidate

AnomalyType = Literal["REAL_ANOMALY", "EXPLAINABLE_ANOMALY", "FALSE_POSITIVE", "DATA_QUALITY"]
Severity = Literal["LOW", "MEDIUM", "HIGH"]

TYPE_ORDER: list[str] = ["REAL_ANOMALY", "DATA_QUALITY", "EXPLAINABLE_ANOMALY", "FALSE_POSITIVE"]
SEVERITY_ORDER: list[str] = ["HIGH", "MEDIUM", "LOW"]


class Decision(BaseModel):
    type: AnomalyType
    severity: Severity
    priority: bool
    confidence: float = Field(ge=0, le=1)
    type_probabilities: dict[str, float] | None = None
    severity_probabilities: dict[str, float] | None = None
    priority_probability: float | None = None
    confidence_parts: dict[str, float] | None = None  # {"type", "severity", "priority"}: the factors of `confidence`
    provider: Literal["jev", "rules"]
    notes: list[str] = Field(default_factory=list)
    latency_ms: int = 0


class Explanation(BaseModel):
    reason: str
    recommended_action: str
    provider: str  # "llm:<model>" | "template"
    notes: list[str] = Field(default_factory=list)
    latency_ms: int = 0


class DecisionProvider(Protocol):
    name: str

    async def decide(self, candidate: Candidate) -> Decision: ...


class ExplanationProvider(Protocol):
    name: str

    async def explain(self, candidate: Candidate, decision: Decision) -> Explanation: ...


class ProviderError(Exception):
    """Raised by adapters; `retryable` drives the single retry in WithFallback."""

    def __init__(self, note: str, retryable: bool = False):
        super().__init__(note)
        self.note = note
        self.retryable = retryable
