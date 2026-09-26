from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import AnalysisRun
from app.schemas import AnalysisRunOut, AnalyzeAccepted, AnalyzeIn

router = APIRouter(prefix="/ai", tags=["ai"])


def _out(run: AnalysisRun, with_stages: bool = True) -> AnalysisRunOut:
    return AnalysisRunOut(
        id=run.id, status=run.status, current_stage=run.current_stage, started_at=run.started_at, finished_at=run.finished_at,
        stages=run.stages if with_stages else None, providers=run.providers, force_refresh=bool(run.force_refresh),
        summary=run.summary, error=run.error,
    )


@router.post("/analyze", response_model=AnalyzeAccepted, status_code=202, summary="Ejecutar análisis IA",
             description="Lanza el pipeline de 7 etapas en segundo plano y devuelve un `analysis_id` para hacer polling. Idempotente: si ya hay un análisis activo devuelve su id con `reused=true`. Con datos de ejemplo tarda ~15–35 s (la etapa de explicación llama a Jev y al LLM en vivo).")
async def analyze(request: Request, body: AnalyzeIn | None = None):
    force = body.force_refresh if body else True
    run_id, status, reused = await request.app.state.runner.start(force_refresh=force)
    return AnalyzeAccepted(analysis_id=run_id, status=status, reused=reused)


@router.get("/analysis", response_model=dict[str, list[AnalysisRunOut]], summary="Historial de análisis", description="Más reciente primero, sin etapas. Útil para retomar el polling al recargar la UI.")
def list_runs(db: Session = Depends(get_db), limit: int = 5):
    runs = db.scalars(select(AnalysisRun).order_by(AnalysisRun.started_at.desc()).limit(min(limit, 50))).all()
    return {"items": [_out(r, with_stages=False) for r in runs]}


@router.get("/analysis/{run_id}", response_model=AnalysisRunOut, summary="Estado de un análisis",
            description="Las 7 etapas con estado (pending|running|done|failed), detalle y tiempos; `summary` al completar (titular \"4 anomalías detectadas, 2 requieren atención prioritaria\"); `error` al fallar. Polling recomendado: 700 ms.")
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(AnalysisRun, run_id)
    if run is None:
        raise AppError("RUN_NOT_FOUND", 404, f"No existe el análisis '{run_id}'.")
    return _out(run)
