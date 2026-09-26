from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Reading
from app.schemas import DashboardSummary
from app.services import dashboard as svc

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(request: Request, db: Session = Depends(get_db)):
    return svc.summary(db, request.app.state.runner.providers)


@router.get("/health")
def health(request: Request, db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(Reading))
    s = request.app.state.settings
    return {"status": "ok", "db": "ok", "readings": n, "providers": request.app.state.runner.providers,
            "jev_model": s.jev_model if s.effective_jev_key else None, "llm_models": s.llm_models if s.openrouter_api_key else []}
