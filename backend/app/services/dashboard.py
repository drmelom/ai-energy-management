from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Meter, Reading
from app.schemas import DashboardSummary
from app.services.data import anomalies_for_run, latest_completed_run


def summary(db: Session, ai_mode: dict[str, str]) -> DashboardSummary:
    by_status = {s: 0 for s in ("NORMAL", "WARNING", "CRITICAL", "UNKNOWN")}
    for st, n in db.execute(select(Meter.status, func.count()).group_by(Meter.status)):
        by_status[st] = n
    total_kwh, t0, t1 = db.execute(select(func.sum(Reading.consumption_kwh), func.min(Reading.timestamp), func.max(Reading.timestamp))).one()
    days = ((t1 - t0).days + 1) if t0 and t1 else 0
    run = latest_completed_run(db)
    anomalies = anomalies_for_run(db, run.id) if run else []
    by_sev: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for a in anomalies:
        by_sev[a.severity] = by_sev.get(a.severity, 0) + 1
        by_type[a.type] = by_type.get(a.type, 0) + 1
    return DashboardSummary(
        meters={"total": sum(by_status.values()), "by_status": by_status},
        consumption={"total_kwh": round(total_kwh or 0, 1), "period_from": t0.date().isoformat() if t0 else None,
                     "period_to": t1.date().isoformat() if t1 else None,
                     "avg_daily_kwh": round((total_kwh or 0) / days, 1) if days else 0},
        anomalies={"total": len(anomalies), "priority": sum(bool(a.priority) for a in anomalies), "by_severity": by_sev, "by_type": by_type,
                   "avg_confidence": round(sum(a.confidence for a in anomalies) / len(anomalies), 2) if anomalies else None,
                   "open": sum(a.status == "OPEN" for a in anomalies)},
        last_analysis={"id": run.id, "status": run.status, "current_stage": run.current_stage, "started_at": run.started_at,
                       "finished_at": run.finished_at, "headline": (run.summary or {}).get("headline"),
                       "providers": run.providers} if run else None,
        ai_mode=ai_mode,
    )
