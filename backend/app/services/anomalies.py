from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import AnalysisRun, Anomaly, Meter
from app.schemas import AiMeta, AnomalyDetail, AnomalyList, AnomalySummary, EventRef
from app.services.data import anomalies_for_run, latest_completed_run


def _summary(a: Anomaly, names: dict[str, str]) -> AnomalySummary:
    return AnomalySummary(
        id=a.id, rank=a.rank, meter_id=a.meter_id, meter_name=names.get(a.meter_id, a.meter_id), detected_at=a.detected_at,
        type=a.type, severity=a.severity, confidence=a.confidence, priority=bool(a.priority), status=a.status,
        reason=a.reason, recommended_action=a.recommended_action,
        providers={"decision": a.ai_meta.get("decision_provider", "?"), "explanation": a.ai_meta.get("explanation_provider", "?")},
    )


def _names(db: Session) -> dict[str, str]:
    return {m.meter_id: m.name for m in db.scalars(select(Meter))}


def list_anomalies(db: Session, run_id: str | None, severity: str | None, type_: str | None, status: str | None,
                   meter_id: str | None, priority: bool | None, sort: str) -> AnomalyList:
    run = db.get(AnalysisRun, run_id) if run_id else latest_completed_run(db)
    if run_id and run is None:
        raise AppError("RUN_NOT_FOUND", 404, f"No existe el análisis '{run_id}'.")
    if run is None:
        return AnomalyList(run_id=None, run_finished_at=None, items=[], total=0)
    rows = anomalies_for_run(db, run.id)
    rows = [a for a in rows if (not severity or a.severity == severity) and (not type_ or a.type == type_)
            and (not status or a.status == status) and (not meter_id or a.meter_id == meter_id) and (priority is None or bool(a.priority) == priority)]
    if sort == "confidence":
        rows.sort(key=lambda a: -a.confidence)
    elif sort == "detected_at":
        rows.sort(key=lambda a: a.detected_at)
    names = _names(db)
    return AnomalyList(run_id=run.id, run_finished_at=run.finished_at, items=[_summary(a, names) for a in rows], total=len(rows))


def get_anomaly(db: Session, anomaly_id: int) -> Anomaly:
    a = db.get(Anomaly, anomaly_id)
    if a is None:
        raise AppError("ANOMALY_NOT_FOUND", 404, f"No existe la anomalía {anomaly_id}.", {"id": anomaly_id})
    return a


def anomaly_detail(db: Session, anomaly_id: int) -> AnomalyDetail:
    a = get_anomaly(db, anomaly_id)
    base = _summary(a, _names(db)).model_dump()
    hours = int((a.window_to - a.window_from).total_seconds() // 3600) + 1
    return AnomalyDetail(
        **base,
        window={"from": a.window_from, "to": a.window_to, "hours": hours},
        evidence=a.evidence,
        events_matched=[EventRef(**e) for e in a.events_matched],
        ai_meta=AiMeta(**a.ai_meta),
        analysis_run_id=a.analysis_run_id,
    )


def set_status(db: Session, anomaly_id: int, status: str) -> AnomalySummary:
    a = get_anomaly(db, anomaly_id)
    a.status = status
    db.commit()
    return _summary(a, _names(db))
