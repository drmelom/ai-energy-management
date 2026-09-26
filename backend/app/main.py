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

    app = FastAPI(title="AI Energy Management API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

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
