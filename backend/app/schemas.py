"""API contract (response/request models). Mirrors backend/ARCHITECTURE.md §4."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.analytics.evidence import Evidence

StageKey = Literal["readings", "baseline", "detection", "correlation", "events", "explanation", "recommendation"]
STAGE_LABELS: dict[str, str] = {
    "readings": "Lecturas", "baseline": "Baseline", "detection": "Detección", "correlation": "Correlación",
    "events": "Eventos", "explanation": "Explicación", "recommendation": "Recomendación",
}


# ---------- embedded JSON ----------
class StageProgress(BaseModel):
    key: StageKey
    label: str
    status: Literal["pending", "running", "done", "failed"] = "pending"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    detail: str | None = None


class RunSummary(BaseModel):
    anomalies_total: int
    priority_count: int
    by_type: dict[str, int]
    by_severity: dict[str, int]
    avg_confidence: float
    headline: str


class AiMeta(BaseModel):
    decision_provider: Literal["jev", "rules"]
    decision_probabilities: dict[str, float] | None = None
    severity_probabilities: dict[str, float] | None = None
    priority_probability: float | None = None
    confidence_probabilities: dict[str, float] | None = None
    explanation_provider: str
    fallback_notes: list[str] = Field(default_factory=list)
    latency_ms: dict[str, int] = Field(default_factory=dict)
    cached: dict[str, bool] = Field(default_factory=dict)


class EventRef(BaseModel):
    event_id: int
    type: str
    timestamp: datetime
    description: str
    relation: str


# ---------- auth ----------
class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    user: dict


# ---------- meters ----------
class AnomalyRef(BaseModel):
    id: int
    type: str
    severity: str
    priority: bool
    status: str = "OPEN"
    detected_at: datetime | None = None


class MeterListItem(BaseModel):
    meter_id: str
    name: str
    location: str | None
    status: str
    total_consumption_kwh: float
    avg_daily_kwh: float
    last_day_kwh: float
    baseline_daily_kwh: float
    variation_pct: float
    last_reading_at: datetime
    anomaly: AnomalyRef | None = None


class MeterList(BaseModel):
    items: list[MeterListItem]
    total: int
    analysis_run_id: str | None


class BaselineHour(BaseModel):
    hour: int
    kwh: float
    kwh_std: float
    voltage_v: float
    current_a: float
    power_factor: float


class MeterDetail(BaseModel):
    meter_id: str
    name: str
    location: str | None
    status: str
    created_at: datetime
    period: dict
    stats: dict
    baseline: dict
    last_day_kwh: float
    baseline_daily_kwh: float
    variation_pct: float
    anomalies: list[AnomalyRef]
    events_count: int


class ReadingPoint(BaseModel):
    timestamp: datetime
    consumption_kwh: float
    voltage_v: float
    current_a: float
    power_factor: float
    baseline_kwh: float | None = None
    deviation_pct: float | None = None


class ReadingsOut(BaseModel):
    meter_id: str
    resolution: Literal["hourly", "daily"]
    from_: datetime = Field(alias="from")
    to: datetime
    points: list[ReadingPoint]
    model_config = {"populate_by_name": True}


class EventOut(BaseModel):
    id: int
    meter_id: str
    timestamp: datetime
    type: str
    description: str


# ---------- anomalies ----------
class AnomalySummary(BaseModel):
    id: int
    rank: int
    meter_id: str
    meter_name: str
    detected_at: datetime
    type: str
    severity: str
    confidence: float
    priority: bool
    status: str
    reason: str
    recommended_action: str
    providers: dict[str, str]


class AnomalyDetail(AnomalySummary):
    window: dict
    evidence: list[Evidence]
    events_matched: list[EventRef]
    ai_meta: AiMeta
    analysis_run_id: str


class AnomalyList(BaseModel):
    run_id: str | None
    run_finished_at: datetime | None
    items: list[AnomalySummary]
    total: int


class AnomalyPatch(BaseModel):
    status: Literal["OPEN", "ACKNOWLEDGED", "RESOLVED"]


# ---------- analysis ----------
class AnalyzeIn(BaseModel):
    force_refresh: bool = True  # demo default: always call the live providers; False reuses cached answers


class AnalyzeAccepted(BaseModel):
    analysis_id: str
    status: str
    reused: bool


class AnalysisRunOut(BaseModel):
    id: str
    status: str
    current_stage: str | None
    started_at: datetime
    finished_at: datetime | None
    stages: list[StageProgress] | None = None
    providers: dict
    force_refresh: bool
    summary: RunSummary | None
    error: dict | None


# ---------- dashboard ----------
class DashboardSummary(BaseModel):
    meters: dict
    consumption: dict
    anomalies: dict
    last_analysis: dict | None
    ai_mode: dict[str, str]
