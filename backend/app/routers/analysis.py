from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import AnalysisRun
from app.schemas import AnalysisRunOut, AnalyzeAccepted, AnalyzeIn

router = APIRouter(prefix="/ai", tags=["ai"])

# Human-readable documentation of each LangGraph node, served with the real graph topology.
NODE_DOCS = {
    "readings": {"label": "Lecturas", "kind": "deterministic", "tech": "SQLite → pandas",
                 "description": "Carga las 4.032 lecturas y los eventos desde la base de datos y valida continuidad horaria (sin huecos, sin nulos).",
                 "outputs": ["readings", "events"]},
    "baseline": {"label": "Baseline", "kind": "deterministic", "tech": "pandas",
                 "description": "Perfil horario por medidor: mediana de kWh, V, A y PF para cada hora del día sobre los primeros 7 días.",
                 "outputs": ["baselines"]},
    "detection": {"label": "Detección", "kind": "deterministic", "tech": "pandas",
                  "description": "Segmentos de consumo (≥ 6 h seguidas con |desvío| ≥ 25 %) y señales de calidad de dato (tensión fuera de ±5 %, saltos > 10 V, residuo P≈V·I·PF errático).",
                  "outputs": ["candidates"]},
    "correlation": {"label": "Correlación", "kind": "deterministic", "tech": "pandas",
                    "description": "Contexto eléctrico de cada segmento: caída de factor de potencia, bajada de tensión y cambio de corriente frente al baseline.",
                    "outputs": ["candidates (+evidencia eléctrica)"]},
    "events": {"label": "Eventos", "kind": "deterministic", "tech": "reglas",
               "description": "Cruce con events.csv en ±24 h con semántica por tipo: OPERATIONAL_CHANGE explica subidas, SCHEDULED_OUTAGE explica bajadas, UNKNOWN no explica nada, DATA_QUALITY corrobora.",
               "outputs": ["candidates (+eventos)"]},
    "explanation": {"label": "Explicación", "kind": "ai", "tech": "Jev + LLM",
                    "description": "Única etapa con IA. Jev (modelo de decisión) responde tres preguntas cerradas sobre la evidencia verbalizada: tipo, severidad y prioridad, con probabilidades. Un LLM redacta razón y acción citando solo cifras de la evidencia; un validador rechaza cifras inventadas. Fallbacks deterministas si un proveedor falla.",
                    "outputs": ["decisions", "explanations"]},
    "recommendation": {"label": "Recomendación", "kind": "deterministic", "tech": "reglas",
                       "description": "Ordena por prioridad, severidad y tipo, calcula el resumen y el titular, y prepara las anomalías para persistir.",
                       "outputs": ["ranked", "summary"]},
}


@router.get("/graph", summary="Grafo del pipeline (LangGraph)",
            description="Topología real del grafo compilado (nodos y aristas) con la documentación de cada nodo y el diagrama Mermaid generado por LangGraph.")
def get_graph(request: Request):
    g = request.app.state.runner.graph.get_graph()
    order = [n for n in g.nodes if not n.startswith("__")]
    return {
        "nodes": [{"key": k, **NODE_DOCS.get(k, {"label": k, "kind": "deterministic", "tech": "", "description": "", "outputs": []})} for k in order],
        "edges": [{"source": e.source, "target": e.target} for e in g.edges],
        "mermaid": g.draw_mermaid(),
    }


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
