from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.ai.factory import build_providers
from app.config import Settings, get_settings
from app.db import Base, make_engine, make_sessionmaker
from app.errors import register_error_handlers, request_id_var
from app.routers import analysis, anomalies, auth, dashboard, events, meters
from app.seed import seed_if_empty
from app.services.analysis import AnalysisRunner

log = logging.getLogger("app")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(settings.database_url)
        Base.metadata.create_all(engine)
        sm = make_sessionmaker(engine)
        with sm() as db:
            seed_if_empty(db, settings.data_dir)
        decide, explain = build_providers(settings)
        runner = AnalysisRunner(sm, settings, decide, explain)
        runner.recover_interrupted()
        app.state.settings, app.state.sessionmaker, app.state.runner = settings, sm, runner
        log.info("startup db=%s decision=%s explanation=%s", settings.database_url, decide.name, explain.name)
        yield
        engine.dispose()

    app = FastAPI(
        title="AI Energy Management API",
        version="1.0.0",
        summary="Medidores eléctricos + IA para detectar, explicar, priorizar y recomendar acciones sobre anomalías.",
        description=(
            "Flujo: **Lecturas → Baseline → Detección → Correlación → Eventos → Explicación → Recomendación**.\n\n"
            "Las cinco primeras etapas son analítica determinista (pandas). La etapa de explicación usa **Jev** (modelo de decisión, "
            "TypeSafe AI) para clasificar tipo, severidad y prioridad con probabilidades, y un LLM para redactar la explicación citando "
            "solo cifras de la evidencia. Sin claves de API todo funciona con reglas y plantillas.\n\n"
            "Demo: `POST /auth/login` (admin/admin) → `GET /dashboard/summary` → `POST /ai/analyze` → `GET /ai/analysis/{id}` "
            "(polling) → `GET /anomalies` → `GET /anomalies/{id}` → `PATCH /anomalies/{id}`."
        ),
        openapi_tags=[
            {"name": "auth", "description": "Login demo. El token es estático y no se verifica en el resto de endpoints."},
            {"name": "dashboard", "description": "KPIs agregados y salud del servicio (modo IA activo)."},
            {"name": "meters", "description": "Gestión de medidores: listado con filtros/orden, detalle con baseline, lecturas con resolución y eventos."},
            {"name": "events", "description": "Eventos operativos conocidos (events.csv)."},
            {"name": "anomalies", "description": "Hallazgos del último análisis, con evidencia, distribución de probabilidad de Jev y cambio de estado (Acción)."},
            {"name": "ai", "description": "Ejecución del pipeline de análisis (asíncrono, pollable, idempotente)."},
        ],
        lifespan=lifespan,
    )
    # any localhost/127.0.0.1 port is allowed in addition to CORS_ORIGINS, so a Vite server on 5174 still works
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://[a-z0-9-]+\.vercel\.app", allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        t0 = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        log.info("http.request method=%s path=%s status=%s duration_ms=%d", request.method, request.url.path,
                 response.status_code, (time.perf_counter() - t0) * 1000)
        return response

    register_error_handlers(app)
    for r in (auth.router, meters.router, events.router, anomalies.router, analysis.router, dashboard.router):
        app.include_router(r)
    return app


app = create_app()
