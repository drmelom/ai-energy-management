"""Shared read helpers: DB → pandas frames, baseline per meter, latest completed run."""
from __future__ import annotations

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.analytics.baseline import BaselineProfile, compute_baselines, prepare
from app.analytics.evidence import EventRecord
from app.models import AnalysisRun, Anomaly, Event, Reading

READING_COLS = ["meter_id", "timestamp", "consumption_kwh", "voltage_v", "current_a", "power_factor", "status"]


def load_readings(db: Session, meter_id: str | None = None) -> pd.DataFrame:
    stmt = select(*[getattr(Reading, c) for c in READING_COLS])
    if meter_id:
        stmt = stmt.where(Reading.meter_id == meter_id)
    rows = db.execute(stmt).all()
    return pd.DataFrame(rows, columns=READING_COLS)


def load_events(db: Session, meter_id: str | None = None) -> list[EventRecord]:
    stmt = select(Event).order_by(Event.timestamp)
    if meter_id:
        stmt = stmt.where(Event.meter_id == meter_id)
    return [EventRecord(id=e.id, meter_id=e.meter_id, timestamp=e.timestamp, type=e.type, description=e.description)
            for e in db.scalars(stmt)]


def prepared_frames(db: Session) -> tuple[pd.DataFrame, dict[str, BaselineProfile]]:
    df = prepare(load_readings(db))
    return df, compute_baselines(df)


def make_loader(sm: sessionmaker):
    """Loader for pipeline stage 1: opens its own session (runs in a worker thread)."""
    def load():
        with sm() as db:
            return load_readings(db), load_events(db)
    return load


def latest_completed_run(db: Session) -> AnalysisRun | None:
    return db.scalars(select(AnalysisRun).where(AnalysisRun.status == "COMPLETED")
                      .order_by(AnalysisRun.finished_at.desc()).limit(1)).first()


def anomalies_for_run(db: Session, run_id: str) -> list[Anomaly]:
    return list(db.scalars(select(Anomaly).where(Anomaly.analysis_run_id == run_id).order_by(Anomaly.rank)))
