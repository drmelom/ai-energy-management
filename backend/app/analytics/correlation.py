"""Electrical context of a consumption segment and event matching. Pure, no IO."""
from __future__ import annotations

import re
from datetime import datetime, timedelta

import pandas as pd

from app.analytics import evidence as ev
from app.analytics.baseline import BaselineProfile
from app.analytics.detectors import Thresholds
from app.analytics.evidence import Candidate, EventRecord

EXPLAINS_UP = {"OPERATIONAL_CHANGE"}
EXPLAINS_DOWN = {"SCHEDULED_OUTAGE", "MAINTENANCE"}
CORROBORATES_DQ = {"DATA_QUALITY"}

_HOURS_RE = re.compile(r"(\d+)\s*(?:h|hours?|horas?)\b", re.IGNORECASE)


def electrical_context(c: Candidate, dfm: pd.DataFrame, bp: BaselineProfile, th: Thresholds) -> None:
    """Compare V / PF / I inside the segment against the baseline profile for the same hours."""
    if c.segment is None:
        return
    seg = c.segment
    inside = dfm[(dfm["timestamp"] >= seg.start) & (dfm["timestamp"] <= seg.end)]
    if inside.empty:
        return
    hours = inside["hour"]
    pf_before, pf_after = float(hours.map(bp.profile["pf_mean"]).mean()), float(inside["power_factor"].mean())
    v_before, v_after = float(hours.map(bp.profile["v_mean"]).mean()), float(inside["voltage_v"].mean())
    i_before, i_after = float(hours.map(bp.profile["i_mean"]).mean()), float(inside["current_a"].mean())

    if pf_before - pf_after >= th.pf_drop:
        c.evidence.append(ev.power_factor_drop(seg, pf_before, pf_after))
    if v_before - v_after >= th.v_sag:
        c.evidence.append(ev.voltage_sag(seg, v_before, v_after))
    if i_before and abs(i_after / i_before - 1) >= th.current_change:
        kwh_ratio = seg.window_kwh / seg.expected_kwh if seg.expected_kwh else 1.0
        coherent = abs((i_after / i_before) / kwh_ratio - 1) <= 0.15
        c.evidence.append(ev.current_change(seg, i_before, i_after, coherent))


def _anchor(c: Candidate) -> datetime | None:
    if c.segment is not None:
        return c.segment.start
    dq = [e for e in c.evidence if e.kind in ("VOLTAGE_OUT_OF_BAND", "VOLTAGE_JUMPS", "POWER_RESIDUAL_ERRATIC")]
    return min(e.window_from for e in dq) if dq else None


def match_events(c: Candidate, events: list[EventRecord], th: Thresholds) -> None:
    """Temporal (±window) + semantic (type vs direction) matching. UNKNOWN never explains."""
    anchor = _anchor(c)
    if anchor is None:
        return
    window = timedelta(hours=th.event_window_hours)
    w1 = c.segment.end if c.segment else max(e.window_to for e in c.evidence)
    direction = c.segment.direction if c.segment else None

    for e in sorted((e for e in events if e.meter_id == c.meter_id), key=lambda e: e.timestamp):
        if abs(e.timestamp - anchor) > window:
            continue
        lag_h = (e.timestamp - anchor).total_seconds() / 3600
        if e.type in EXPLAINS_UP and direction == "up" or e.type in EXPLAINS_DOWN and direction == "down":
            relation = "explains"
            c.explaining_event = c.explaining_event or e
            c.evidence.append(ev.event_evidence("EVENT_EXPLAINS", e, anchor, lag_h))
            m = _HOURS_RE.search(e.description)
            if m and c.segment is not None and e.type in EXPLAINS_DOWN:
                declared = int(m.group(1))
                if c.segment.hours <= 1.5 * declared:
                    c.evidence.append(ev.duration_match(c.segment, declared, e))
        elif e.type in CORROBORATES_DQ and c.dq_score >= th.dq_score_min:
            relation = "corroborates_dq"
            c.evidence.append(ev.event_evidence("EVENT_CORROBORATES_DQ", e, anchor, lag_h))
        elif e.type == "UNKNOWN":
            relation = "reported_no_explanation"
            c.evidence.append(ev.event_evidence("EVENT_REPORTED_UNKNOWN", e, anchor, lag_h))
        else:
            relation = "unrelated"
        c.events.append((e, relation))

    if c.segment is not None and c.explaining_event is None:
        c.evidence.append(ev.no_explaining_event(anchor, w1))


def enrich(candidates: list[Candidate], df: pd.DataFrame, baselines: dict[str, BaselineProfile],
           events: list[EventRecord], th: Thresholds = Thresholds()) -> list[Candidate]:
    """Stages 4 (correlation) and 5 (events) for every candidate with findings."""
    for c in candidates:
        if not c.has_findings:
            continue
        dfm = df[df["meter_id"] == c.meter_id]
        electrical_context(c, dfm, baselines[c.meter_id], th)
        match_events(c, events, th)
    return candidates


def events_from_frame(events: pd.DataFrame) -> list[EventRecord]:
    ts_col = "event_timestamp" if "event_timestamp" in events.columns else "timestamp"
    type_col = "event_type" if "event_type" in events.columns else "type"
    return [
        EventRecord(id=int(r.get("id", i + 1)), meter_id=str(r["meter_id"]), timestamp=pd.Timestamp(r[ts_col]).to_pydatetime(),
                    type=str(r[type_col]), description=str(r["description"]))
        for i, r in enumerate(events.to_dict("records"))
    ]
