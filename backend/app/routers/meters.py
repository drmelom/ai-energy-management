from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Event
from app.schemas import EventOut, MeterDetail, MeterList, ReadingsOut
from app.services import meters as svc

router = APIRouter(prefix="/meters", tags=["meters"])


@router.get("", response_model=MeterList)
def list_meters(
    db: Session = Depends(get_db),
    status: Literal["UNKNOWN", "NORMAL", "WARNING", "CRITICAL"] | None = None,
    search: str | None = None,
    sort: Literal["consumption", "variation", "severity", "meter_id"] = "meter_id",
    order: Literal["asc", "desc"] | None = None,
):
    return svc.list_meters(db, status, search, sort, order)


@router.get("/{meter_id}", response_model=MeterDetail)
def get_meter(meter_id: str, db: Session = Depends(get_db)):
    return svc.meter_detail(db, meter_id)


@router.get("/{meter_id}/readings", response_model=ReadingsOut, response_model_by_alias=True)
def get_readings(
    meter_id: str,
    db: Session = Depends(get_db),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    resolution: Literal["hourly", "daily"] = "hourly",
    include_baseline: bool = False,
):
    return svc.meter_readings(db, meter_id, from_, to, resolution, include_baseline)


@router.get("/{meter_id}/events", response_model=dict[str, list[EventOut]])
def get_meter_events(meter_id: str, db: Session = Depends(get_db)):
    svc.get_meter(db, meter_id)
    items = db.scalars(select(Event).where(Event.meter_id == meter_id).order_by(Event.timestamp)).all()
    return {"items": [EventOut.model_validate(e, from_attributes=True) for e in items]}
