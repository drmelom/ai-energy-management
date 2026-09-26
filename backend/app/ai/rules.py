"""Deterministic decision provider: fallback when Jev is unavailable and guardrail when Jev contradicts evidence."""
from __future__ import annotations

from app.analytics.evidence import Candidate
from app.ai.ports import Decision

OUTAGE_TYPES = {"SCHEDULED_OUTAGE", "MAINTENANCE"}


def decide_by_rules(c: Candidate, notes: list[str] | None = None) -> Decision:
    kinds = {e.kind for e in c.evidence}
    seg = c.segment
    dev = abs(seg.mean_dev_pct) if seg else 0.0

    if c.dq_score >= 2:
        type_ = "DATA_QUALITY"
        severity = "HIGH" if (c.dq_score == 3 or c.dq_signals.get("low_power_factor")) else "MEDIUM"
        conf = 0.60 + 0.10 * c.dq_score + (0.05 if "EVENT_CORROBORATES_DQ" in kinds else 0.0)
    elif seg is not None:
        if c.explaining_event is not None:
            type_ = "FALSE_POSITIVE" if c.explaining_event.type in OUTAGE_TYPES else "EXPLAINABLE_ANOMALY"
        else:
            type_ = "REAL_ANOMALY"
        if type_ == "REAL_ANOMALY":
            severity = "HIGH" if (dev >= 50 or "POWER_FACTOR_DROP" in kinds) else "MEDIUM"
        elif type_ == "EXPLAINABLE_ANOMALY":
            severity = "MEDIUM" if (dev >= 25 and seg.hours >= 48) else "LOW"
        else:
            severity = "LOW"
        conf = 0.70
        if type_ == "REAL_ANOMALY":
            # magnitude and electrical corroboration raise confidence in a real anomaly
            conf += 0.15 if dev >= 50 else 0.0
            conf += 0.10 if dev >= 100 else 0.0
            conf += min(0.10, 0.05 * len(kinds & {"POWER_FACTOR_DROP", "VOLTAGE_SAG", "CURRENT_CHANGE"}))
        else:
            # alignment with the declared event raises confidence in the explanation
            lag_h = abs((c.explaining_event.timestamp - seg.start).total_seconds()) / 3600
            conf += 0.15 if lag_h <= 1 else 0.0
            conf += 0.05 if "DURATION_MATCH" in kinds else 0.0
    else:
        raise ValueError(f"{c.meter_id}: no findings to decide on")

    return Decision(
        type=type_,
        severity=severity,
        priority=type_ in {"REAL_ANOMALY", "DATA_QUALITY"} and severity == "HIGH",
        confidence=round(min(0.97, max(0.50, conf)), 2),
        provider="rules",
        notes=list(notes or []),
    )


class RulesDecisionProvider:
    name = "rules"

    async def decide(self, candidate: Candidate) -> Decision:
        return decide_by_rules(candidate)


def violates_guardrail(c: Candidate, d: Decision) -> str | None:
    """G1: explained types need an explaining event. G2: DATA_QUALITY needs at least one DQ signal."""
    if d.type in {"EXPLAINABLE_ANOMALY", "FALSE_POSITIVE"} and c.explaining_event is None:
        return "guardrail:G1"
    if d.type == "DATA_QUALITY" and c.dq_score < 1:
        return "guardrail:G2"
    return None
