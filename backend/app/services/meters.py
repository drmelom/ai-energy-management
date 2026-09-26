from __future__ import annotations

from datetime import datetime

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.ports import SEVERITY_ORDER, TYPE_ORDER
from app.analytics.baseline import meter_metrics
from app.errors import AppError
from app.models import Event, Meter
from app.schemas import AnomalyRef, BaselineHour, MeterDetail, MeterList, MeterListItem, ReadingPoint, ReadingsOut
from app.services.data import anomalies_for_run, latest_completed_run, prepared_frames


def _anomaly_index(db: Session) -> tuple[str | None, dict[str, AnomalyRef]]:
    run = latest_completed_run(db)
    if run is None:
        return None, {}
    idx = {a.meter_id: AnomalyRef(id=a.id, type=a.type, severity=a.severity, priority=a.priority, status=a.status,
                                  detected_at=a.detected_at) for a in anomalies_for_run(db, run.id)}
    return run.id, idx


def list_meters(db: Session, status: str | None, search: str | None, sort: str, order: str | None) -> MeterList:
    run_id, anomalies = _anomaly_index(db)
    df, baselines = prepared_frames(db)
    items: list[MeterListItem] = []
    for m in db.scalars(select(Meter).order_by(Meter.meter_id)):
        if status and m.status != status:
            continue
        if search and search.lower() not in m.meter_id.lower() and search.lower() not in m.name.lower():
            continue
        dfm = df[df["meter_id"] == m.meter_id]
        met = meter_metrics(dfm, baselines[m.meter_id])
        items.append(MeterListItem(
            meter_id=m.meter_id, name=m.name, location=m.location, status=m.status,
            total_consumption_kwh=met["total_kwh"], avg_daily_kwh=round(met["total_kwh"] / dfm["date"].nunique(), 1),
            last_day_kwh=met["last_day_kwh"], baseline_daily_kwh=met["baseline_daily_kwh"], variation_pct=met["variation_pct"],
            last_reading_at=dfm["timestamp"].max().to_pydatetime(), anomaly=anomalies.get(m.meter_id),
        ))

    def sev_key(i: MeterListItem):
        a = i.anomaly
        return (SEVERITY_ORDER.index(a.severity), TYPE_ORDER.index(a.type)) if a else (len(SEVERITY_ORDER), len(TYPE_ORDER))

    if sort == "severity":
        items.sort(key=lambda i: (sev_key(i), -abs(i.variation_pct)), reverse=(order == "asc"))
    elif sort == "consumption":
        items.sort(key=lambda i: i.total_consumption_kwh, reverse=(order != "asc"))
    elif sort == "variation":
        items.sort(key=lambda i: abs(i.variation_pct), reverse=(order != "asc"))
    else:
        items.sort(key=lambda i: i.meter_id, reverse=(order == "desc"))
    return MeterList(items=items, total=len(items), analysis_run_id=run_id)


def get_meter(db: Session, meter_id: str) -> Meter:
    m = db.scalar(select(Meter).where(Meter.meter_id == meter_id))
    if m is None:
        raise AppError("METER_NOT_FOUND", 404, f"No existe el medidor '{meter_id}'.", {"meter_id": meter_id})
    return m


def meter_detail(db: Session, meter_id: str) -> MeterDetail:
    m = get_meter(db, meter_id)
    df, baselines = prepared_frames(db)
    dfm = df[df["meter_id"] == meter_id]
    bp = baselines[meter_id]
    met = meter_metrics(dfm, bp)
    run_id, _ = _anomaly_index(db)
    anomalies = [AnomalyRef(id=a.id, type=a.type, severity=a.severity, priority=a.priority, status=a.status, detected_at=a.detected_at)
                 for a in (anomalies_for_run(db, run_id) if run_id else []) if a.meter_id == meter_id]
    prof = bp.profile
    hourly = [BaselineHour(hour=int(h), kwh=round(float(r.kwh_median), 2), kwh_std=round(float(r.kwh_std), 2),
                           voltage_v=round(float(r.v_mean), 1), current_a=round(float(r.i_mean), 1),
                           power_factor=round(float(r.pf_mean), 3)) for h, r in prof.iterrows()]
    return MeterDetail(
        meter_id=m.meter_id, name=m.name, location=m.location, status=m.status, created_at=m.created_at,
        period={"from": dfm["timestamp"].min(), "to": dfm["timestamp"].max(), "readings": int(len(dfm))},
        stats={
            "total_kwh": met["total_kwh"], "avg_daily_kwh": round(met["total_kwh"] / dfm["date"].nunique(), 1),
            "avg_voltage_v": round(float(dfm["voltage_v"].mean()), 1), "min_voltage_v": round(float(dfm["voltage_v"].min()), 1),
            "max_voltage_v": round(float(dfm["voltage_v"].max()), 1), "avg_current_a": round(float(dfm["current_a"].mean()), 1),
            "avg_power_factor": round(float(dfm["power_factor"].mean()), 3), "min_power_factor": round(float(dfm["power_factor"].min()), 3),
        },
        baseline={"days": 7, "from": bp.window_start.date().isoformat(), "to": bp.window_end.date().isoformat(),
                  "daily_kwh": round(bp.daily_kwh, 1), "hourly": [h.model_dump() for h in hourly]},
        last_day_kwh=met["last_day_kwh"], baseline_daily_kwh=met["baseline_daily_kwh"], variation_pct=met["variation_pct"],
        anomalies=anomalies,
        events_count=int(db.scalar(select(func.count()).select_from(Event).where(Event.meter_id == meter_id)) or 0),
    )


def meter_readings(db: Session, meter_id: str, from_: datetime | None, to: datetime | None,
                   resolution: str, include_baseline: bool) -> ReadingsOut:
    get_meter(db, meter_id)
    if from_ and to and from_ > to:
        raise AppError("INVALID_RANGE", 400, "'from' debe ser anterior a 'to'.")
    df, baselines = prepared_frames(db)
    bp = baselines[meter_id]
    dfm = df[df["meter_id"] == meter_id]
    if from_:
        dfm = dfm[dfm["timestamp"] >= from_]
    if to:
        dfm = dfm[dfm["timestamp"] <= to]
    points: list[ReadingPoint] = []
    if resolution == "daily":
        g = dfm.groupby("date").agg(consumption_kwh=("consumption_kwh", "sum"), voltage_v=("voltage_v", "mean"),
                                    current_a=("current_a", "mean"), power_factor=("power_factor", "mean"), n=("hour", "size"))
        for d, r in g.iterrows():
            base = bp.daily_kwh * r.n / 24
            points.append(ReadingPoint(timestamp=d.to_pydatetime(), consumption_kwh=round(r.consumption_kwh, 1),
                                       voltage_v=round(r.voltage_v, 1), current_a=round(r.current_a, 1), power_factor=round(r.power_factor, 3),
                                       baseline_kwh=round(base, 1) if include_baseline else None,
                                       deviation_pct=round((r.consumption_kwh / base - 1) * 100, 1) if include_baseline else None))
    else:
        exp = bp.expected(dfm["hour"]) if include_baseline else None
        for i, r in enumerate(dfm.itertuples(index=False)):
            b = float(exp.iloc[i]) if include_baseline else None
            points.append(ReadingPoint(timestamp=r.timestamp.to_pydatetime(), consumption_kwh=round(r.consumption_kwh, 2),
                                       voltage_v=round(r.voltage_v, 2), current_a=round(r.current_a, 2), power_factor=round(r.power_factor, 3),
                                       baseline_kwh=round(b, 2) if b is not None else None,
                                       deviation_pct=round((r.consumption_kwh / b - 1) * 100, 1) if b else None))
    lo = dfm["timestamp"].min().to_pydatetime() if len(dfm) else (from_ or datetime.min)
    hi = dfm["timestamp"].max().to_pydatetime() if len(dfm) else (to or datetime.min)
    return ReadingsOut(meter_id=meter_id, resolution=resolution, **{"from": lo}, to=hi, points=points)
