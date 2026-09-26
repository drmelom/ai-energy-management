"""Load data/*.csv into SQLite once, on first startup. Idempotent; fails loudly on bad data."""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from app.analytics.baseline import READING_COLUMNS
from app.errors import AppError
from app.models import Event, Meter, Reading

log = logging.getLogger(__name__)


def seed_if_empty(db: Session, data_dir: Path) -> int:
    if db.scalar(select(func.count()).select_from(Reading)):
        return 0
    readings = pd.read_csv(data_dir / "readings.csv")
    events = pd.read_csv(data_dir / "events.csv")
    _validate(readings)

    readings["timestamp"] = pd.to_datetime(readings["timestamp"])
    events["timestamp"] = pd.to_datetime(events["event_timestamp"])
    now = datetime.utcnow()
    meters = sorted(readings["meter_id"].unique())
    db.execute(insert(Meter), [
        {"meter_id": m, "name": f"Medidor {m}", "location": f"Zona {i + 1}", "status": "UNKNOWN", "created_at": now}
        for i, m in enumerate(meters)
    ])
    db.execute(insert(Reading), [
        {**{c: r[c] for c in READING_COLUMNS}, "timestamp": r["timestamp"].to_pydatetime(), "status": r.get("status", "OK")}
        for r in readings.to_dict("records")
    ])
    db.execute(insert(Event), [
        {"meter_id": r["meter_id"], "timestamp": r["timestamp"].to_pydatetime(), "type": r["event_type"], "description": r["description"]}
        for r in events.to_dict("records")
    ])
    db.commit()
    log.info("seed rows=%d meters=%d events=%d", len(readings), len(meters), len(events))
    return len(readings)


def _validate(readings: pd.DataFrame) -> None:
    missing = [c for c in READING_COLUMNS if c not in readings.columns]
    if missing:
        raise AppError("SEED_INVALID", 500, f"readings.csv sin columnas {missing}")
    if readings[READING_COLUMNS].isna().any().any():
        raise AppError("SEED_INVALID", 500, "readings.csv contiene valores nulos")
    counts = readings.groupby("meter_id").size()
    if counts.nunique() != 1:
        raise AppError("SEED_INVALID", 500, f"lecturas por medidor desiguales: {counts.to_dict()}")
    ts = pd.to_datetime(readings["timestamp"])
    for m, g in ts.groupby(readings["meter_id"]):
        g = g.sort_values()
        if not (g.diff().dropna() == pd.Timedelta(hours=1)).all():
            raise AppError("SEED_INVALID", 500, f"huecos horarios en {m}")
