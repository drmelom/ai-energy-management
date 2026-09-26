from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Event
from app.schemas import EventOut

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=dict[str, list[EventOut]])
def list_events(db: Session = Depends(get_db), meter_id: str | None = None, type: str | None = None):
    stmt = select(Event).order_by(Event.timestamp)
    if meter_id:
        stmt = stmt.where(Event.meter_id == meter_id)
    if type:
        stmt = stmt.where(Event.type == type)
    return {"items": [EventOut.model_validate(e, from_attributes=True) for e in db.scalars(stmt)]}
