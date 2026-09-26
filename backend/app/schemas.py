"""API contract (response/request models). Mirrors backend/ARCHITECTURE.md §4."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
    confidence_parts: dict[str, float] | None = None
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
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "meter_id": "M-109", "name": "Medidor M-109", "location": "Zona 9", "status": "CRITICAL",
        "total_consumption_kwh": 17526.0, "avg_daily_kwh": 1251.9, "last_day_kwh": 2207.6, "baseline_daily_kwh": 1048.8,
        "variation_pct": 110.5, "last_reading_at": "2026-09-14T23:00:00",
        "anomaly": {"id": 1, "type": "REAL_ANOMALY", "severity": "HIGH", "priority": True, "status": "OPEN", "detected_at": "2026-09-12T14:00:00"},
    }]})
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
    """Shape of an AI finding. Superset of the JSON in the test statement (§10):
    meter_id, anomaly, type, severity, confidence, reason, recommended_action."""
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "id": 1, "rank": 1, "meter_id": "M-109", "meter_name": "Medidor M-109", "anomaly": True,
        "detected_at": "2026-09-12T14:00:00", "type": "REAL_ANOMALY", "severity": "HIGH", "confidence": 0.81,
        "priority": True, "status": "OPEN",
        "reason": "El consumo medio en la ventana fue un 110,4 % superior al baseline horario (≈ 2.227 kWh/día frente a ≈ 1.058 kWh/día) sin evento operativo conocido; el factor de potencia cayó de 0,94 a 0,74.",
        "recommended_action": "Investigar la instalación y las cargas conectadas y verificar el medidor en campo.",
        "providers": {"decision": "jev", "explanation": "llm:nvidia/nemotron-3-super-120b-a12b:free"},
    }]})

    id: int
    rank: int = Field(description="1 = más urgente dentro del análisis")
    meter_id: str
    meter_name: str
    anomaly: bool = Field(default=True, description="Siempre true: solo se persisten los medidores con hallazgos (campo del JSON del enunciado)")
    detected_at: datetime
    type: str = Field(description="REAL_ANOMALY | EXPLAINABLE_ANOMALY | FALSE_POSITIVE | DATA_QUALITY")
    severity: str = Field(description="LOW | MEDIUM | HIGH")
    confidence: float = Field(ge=0, le=1, description="Producto de la certeza de Jev en tipo, severidad y prioridad (ver ai_meta.confidence_parts)")
    priority: bool = Field(description="Requiere investigación prioritaria")
    status: str = Field(description="OPEN | ACKNOWLEDGED | RESOLVED (paso Acción)")
    reason: str
    recommended_action: str
    providers: dict[str, str] = Field(description="Quién decidió (jev|rules) y quién explicó (llm:<modelo>|template)")
    confidence_parts: dict[str, float] | None = Field(default=None, description="Factores de la confianza: certeza de tipo, severidad y prioridad")


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
    model_config = ConfigDict(json_schema_extra={"examples": [{"force_refresh": True}]})
    force_refresh: bool = Field(default=True, description="true: llama a Jev y al LLM en vivo. false: reutiliza respuestas cacheadas para la misma evidencia (tabla ai_cache).")


class AnalyzeAccepted(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"analysis_id": "b3412624-fb38-4378-a904-fa764a3362af", "status": "QUEUED", "reused": False}]})
    analysis_id: str
    status: str = Field(description="QUEUED al crear; RUNNING si ya había un análisis activo (reused=true)")
    reused: bool = Field(description="true cuando se devolvió el análisis ya en curso (idempotente ante doble clic)")


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
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "meters": {"total": 12, "by_status": {"NORMAL": 9, "WARNING": 1, "CRITICAL": 2, "UNKNOWN": 0}},
        "consumption": {"total_kwh": 155250.9, "period_from": "2026-09-01", "period_to": "2026-09-14", "avg_daily_kwh": 11089.3},
        "anomalies": {"total": 4, "priority": 2, "by_severity": {"HIGH": 2, "MEDIUM": 1, "LOW": 1},
                      "by_type": {"REAL_ANOMALY": 1, "DATA_QUALITY": 1, "EXPLAINABLE_ANOMALY": 1, "FALSE_POSITIVE": 1}, "avg_confidence": 0.89, "open": 4},
        "last_analysis": {"id": "b3412624-…", "status": "COMPLETED", "current_stage": None, "started_at": "2026-09-26T18:52:44",
                          "finished_at": "2026-09-26T18:53:16", "headline": "4 anomalías detectadas, 2 requieren atención prioritaria",
                          "providers": {"decision": "jev", "explanation": "llm"}},
        "ai_mode": {"decision": "jev", "explanation": "llm"},
    }]})
    meters: dict
    consumption: dict
    anomalies: dict
    last_analysis: dict | None
    ai_mode: dict[str, str]
