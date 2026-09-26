from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import AnomalyDetail, AnomalyList, AnomalyPatch, AnomalySummary
from app.services import anomalies as svc

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("", response_model=AnomalyList, summary="Anomalías del último análisis",
            description="Por defecto las del último análisis COMPLETED (o `run_id`). Orden por `rank` (prioridad), `confidence` o `detected_at`. Cada ítem sigue el JSON del enunciado: meter_id, anomaly, type, severity, confidence, reason, recommended_action.")
def list_anomalies(
    db: Session = Depends(get_db),
    run_id: str | None = None,
    severity: Literal["LOW", "MEDIUM", "HIGH"] | None = None,
    type: Literal["REAL_ANOMALY", "EXPLAINABLE_ANOMALY", "FALSE_POSITIVE", "DATA_QUALITY"] | None = None,
    status: Literal["OPEN", "ACKNOWLEDGED", "RESOLVED"] | None = None,
    meter_id: str | None = None,
    priority: bool | None = None,
    sort: Literal["priority", "confidence", "detected_at"] = "priority",
):
    return svc.list_anomalies(db, run_id, severity, type, status, meter_id, priority, sort)


@router.get("/{anomaly_id}", response_model=AnomalyDetail, summary="Investigación de una anomalía",
            description="Ventana afectada, lista de evidencia (kind, observado, esperado, desvío, texto), eventos relacionados con su relación y `ai_meta` (distribuciones de Jev, factores de la confianza, proveedores, latencias, notas de fallback).")
def get_anomaly(anomaly_id: int, db: Session = Depends(get_db)):
    return svc.anomaly_detail(db, anomaly_id)


@router.patch("/{anomaly_id}", response_model=AnomalySummary, summary="Cambiar estado (paso Acción)",
              description="OPEN → ACKNOWLEDGED → RESOLVED. El estado se conserva en análisis posteriores del mismo medidor y tipo.")
def patch_anomaly(anomaly_id: int, body: AnomalyPatch, db: Session = Depends(get_db)):
    return svc.set_status(db, anomaly_id, body.status)
