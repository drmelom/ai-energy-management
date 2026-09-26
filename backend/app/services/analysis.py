"""AnalysisRunner: one live run at a time, executed as an asyncio.Task, progress persisted after every node.

# ponytail: in-memory run handle + single uvicorn worker. With several workers the lock would move to a
# RUNNING row in analysis_runs and execution to a separate process; the API contract would not change.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from app.ai.factory import DecisionWithFallback, ExplanationWithFallback
from app.config import Settings
from app.models import AiCache, AnalysisRun, Anomaly, Meter
from app.pipeline.graph import build_graph
from app.pipeline.nodes import make_nodes
from app.pipeline.state import STAGES
from app.schemas import STAGE_LABELS
from app.services.data import latest_completed_run, make_loader

log = logging.getLogger(__name__)


class SqliteAiCache:
    def __init__(self, sm: sessionmaker):
        self.sm = sm

    def get(self, key: str) -> dict | None:
        with self.sm() as db:
            row = db.get(AiCache, key)
            if row is None:
                return None
            row.hits += 1
            db.commit()
            return row.payload

    def set(self, key: str, value: dict, provider: str = "", meter_id: str = "") -> None:
        with self.sm() as db:
            db.merge(AiCache(key=key, provider=provider, meter_id=meter_id, payload=value, created_at=datetime.utcnow()))
            db.commit()


def _status_for(anomaly_type: str, severity: str) -> str:
    if severity == "HIGH":
        return "CRITICAL"
    if severity == "MEDIUM" or anomaly_type == "EXPLAINABLE_ANOMALY":
        return "WARNING"
    return "NORMAL"


class AnalysisRunner:
    def __init__(self, sm: sessionmaker, settings: Settings, decide: DecisionWithFallback, explain: ExplanationWithFallback):
        self.sm, self.settings = sm, settings
        self.providers = {"decision": decide.name, "explanation": explain.name}
        nodes = make_nodes(make_loader(sm), decide, explain, cache=SqliteAiCache(sm))
        self.graph = build_graph(nodes)
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self.active_run_id: str | None = None

    # ---- lifecycle ----
    def recover_interrupted(self) -> None:
        with self.sm() as db:
            db.execute(update(AnalysisRun).where(AnalysisRun.status.in_(["QUEUED", "RUNNING"]))
                       .values(status="FAILED", finished_at=datetime.utcnow(),
                               error={"code": "INTERRUPTED", "message": "El proceso se reinició durante el análisis."}))
            db.commit()

    async def start(self, force_refresh: bool = True) -> tuple[str, str, bool]:
        async with self._lock:
            if self._task and not self._task.done():
                return self.active_run_id, "RUNNING", True
            run_id = str(uuid.uuid4())
            stages = [{"key": k, "label": STAGE_LABELS[k], "status": "pending", "started_at": None, "finished_at": None, "detail": None}
                      for k in STAGES]
            with self.sm() as db:
                db.add(AnalysisRun(id=run_id, status="QUEUED", current_stage=None, stages=stages, started_at=datetime.utcnow(),
                                   providers=self.providers, force_refresh=force_refresh))
                db.commit()
            self.active_run_id = run_id
            self._task = asyncio.create_task(self._execute(run_id, force_refresh))
            return run_id, "QUEUED", False

    async def wait(self) -> None:
        if self._task:
            await self._task

    # ---- execution ----
    async def _execute(self, run_id: str, force_refresh: bool) -> None:
        try:
            await asyncio.wait_for(self._run_graph(run_id, force_refresh), timeout=self.settings.analysis_timeout_seconds)
        except asyncio.TimeoutError:
            self._fail(run_id, "TIMEOUT", f"El análisis superó {self.settings.analysis_timeout_seconds:.0f} s.")
        except Exception as e:  # noqa: BLE001
            log.exception("run %s failed", run_id)
            self._fail(run_id, "PIPELINE_ERROR", str(e)[:300])

    async def _run_graph(self, run_id: str, force_refresh: bool) -> None:
        log.info("run.start run_id=%s force_refresh=%s", run_id, force_refresh)
        self._stage(run_id, STAGES[0], "running")
        final_state: dict = {}
        async for update_ in self.graph.astream({"run_id": run_id, "force_refresh": force_refresh}, stream_mode="updates"):
            for key, delta in update_.items():
                if key not in STAGES:
                    continue
                final_state.update(delta)
                self._stage(run_id, key, "done", detail=delta.get("stage_notes", {}).get(key))
                nxt = STAGES[STAGES.index(key) + 1] if key != STAGES[-1] else None
                if nxt:
                    self._stage(run_id, nxt, "running")
        self._persist_results(run_id, final_state)

    def _stage(self, run_id: str, key: str, status: str, detail: str | None = None) -> None:
        now = datetime.utcnow().isoformat(timespec="milliseconds")
        with self.sm() as db:
            run = db.get(AnalysisRun, run_id)
            stages = [dict(s) for s in run.stages]
            for s in stages:
                if s["key"] == key:
                    s["status"] = status
                    if status == "running":
                        s["started_at"] = now
                    else:
                        s["finished_at"] = now
                        if detail:
                            s["detail"] = detail
            run.stages = stages
            run.current_stage = key if status == "running" else run.current_stage
            run.status = "RUNNING"
            db.commit()
            log.info("run.stage run_id=%s stage=%s status=%s detail=%r", run_id, key, status, detail)

    def _fail(self, run_id: str, code: str, message: str) -> None:
        with self.sm() as db:
            run = db.get(AnalysisRun, run_id)
            stages = [dict(s) for s in run.stages]
            for s in stages:
                if s["status"] == "running":
                    s["status"] = "failed"
            run.stages, run.status, run.error = stages, "FAILED", {"code": code, "message": message}
            run.finished_at = datetime.utcnow()
            db.commit()

    def _persist_results(self, run_id: str, state: dict) -> None:
        rows = state.get("ranked", [])
        summary = state.get("summary")
        with self.sm() as db:
            prev = latest_completed_run(db)
            carry: dict[tuple[str, str], str] = {}
            if prev:
                for a in db.scalars(select(Anomaly).where(Anomaly.analysis_run_id == prev.id)):
                    carry[(a.meter_id, a.type)] = a.status
            status_by_meter: dict[str, str] = {}
            for r in rows:
                c, d, e = r["candidate"], r["decision"], r["explanation"]
                w0 = c.segment.start if c.segment else min(x.window_from for x in c.evidence)
                w1 = c.segment.end if c.segment else max(x.window_to for x in c.evidence)
                db.add(Anomaly(
                    analysis_run_id=run_id, meter_id=c.meter_id, detected_at=w0, window_from=w0, window_to=w1,
                    type=d.type, severity=d.severity, confidence=d.confidence, priority=d.priority, rank=r["rank"],
                    reason=e.reason, recommended_action=e.recommended_action,
                    status=carry.get((c.meter_id, d.type), "OPEN"),
                    evidence=[x.model_dump(mode="json") for x in c.evidence],
                    events_matched=[{"event_id": ev.id, "type": ev.type, "timestamp": ev.timestamp.isoformat(),
                                     "description": ev.description, "relation": rel} for ev, rel in c.events],
                    ai_meta={
                        "decision_provider": d.provider, "decision_probabilities": d.type_probabilities,
                        "severity_probabilities": d.severity_probabilities, "priority_probability": d.priority_probability, "confidence_parts": d.confidence_parts,
                        "explanation_provider": e.provider, "fallback_notes": d.notes + e.notes,
                        "latency_ms": {"decision": d.latency_ms, "explanation": e.latency_ms}, "cached": r.get("cached", {}),
                    },
                    created_at=datetime.utcnow(),
                ))
                status_by_meter[c.meter_id] = _status_for(d.type, d.severity)
            for m in db.scalars(select(Meter)):
                m.status = status_by_meter.get(m.meter_id, "NORMAL")
            run = db.get(AnalysisRun, run_id)
            run.status, run.current_stage, run.summary, run.finished_at = "COMPLETED", None, summary, datetime.utcnow()
            db.commit()
        log.info("run.finished run_id=%s anomalies=%d priority=%d", run_id, len(rows), summary["priority_count"] if summary else 0)
