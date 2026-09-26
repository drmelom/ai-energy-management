from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Meter(Base):
    __tablename__ = "meters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    location: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default="UNKNOWN")  # UNKNOWN|NORMAL|WARNING|CRITICAL
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (Index("ix_readings_meter_ts", "meter_id", "timestamp", unique=True),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_id: Mapped[str] = mapped_column(String, ForeignKey("meters.meter_id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    consumption_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    voltage_v: Mapped[float] = mapped_column(Float, nullable=False)
    current_a: Mapped[float] = mapped_column(Float, nullable=False)
    power_factor: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="OK")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_meter_ts", "meter_id", "timestamp"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meter_id: Mapped[str] = mapped_column(String, ForeignKey("meters.meter_id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (Index("ix_runs_started", "started_at"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid4
    status: Mapped[str] = mapped_column(String, nullable=False)  # QUEUED|RUNNING|COMPLETED|FAILED
    current_stage: Mapped[str | None] = mapped_column(String)
    stages: Mapped[list] = mapped_column(JSON, nullable=False)  # list[StageProgress]
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    summary: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[dict | None] = mapped_column(JSON)
    providers: Mapped[dict] = mapped_column(JSON, nullable=False)  # {"decision": "jev|rules", "explanation": "llm|template"}
    force_refresh: Mapped[bool] = mapped_column(Integer, nullable=False, default=True)


class Anomaly(Base):
    __tablename__ = "anomalies"
    __table_args__ = (Index("ix_anomalies_run", "analysis_run_id", "rank"), Index("ix_anomalies_meter", "meter_id"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    analysis_run_id: Mapped[str] = mapped_column(String, ForeignKey("analysis_runs.id"), nullable=False)
    meter_id: Mapped[str] = mapped_column(String, ForeignKey("meters.meter_id"), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    window_from: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    window_to: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    priority: Mapped[bool] = mapped_column(Integer, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="OPEN")  # OPEN|ACKNOWLEDGED|RESOLVED
    evidence: Mapped[list] = mapped_column(JSON, nullable=False)
    events_matched: Mapped[list] = mapped_column(JSON, nullable=False)
    ai_meta: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class AiCache(Base):
    """Cache of provider answers keyed by sha256(provider|evidence). Bypassed when a run has force_refresh=True."""
    __tablename__ = "ai_cache"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)  # decision | explanation
    meter_id: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    hits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
