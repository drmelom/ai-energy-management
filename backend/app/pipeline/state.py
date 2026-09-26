from __future__ import annotations

from typing import Any, TypedDict

import pandas as pd

from app.ai.ports import Decision, Explanation
from app.analytics.baseline import BaselineProfile
from app.analytics.evidence import Candidate, EventRecord

STAGES: list[str] = ["readings", "baseline", "detection", "correlation", "events", "explanation", "recommendation"]


class PipelineState(TypedDict, total=False):
    run_id: str
    force_refresh: bool
    # stage 1
    readings: pd.DataFrame
    events: list[EventRecord]
    # stage 2
    baselines: dict[str, BaselineProfile]
    # stage 3..5
    candidates: list[Candidate]
    # stage 6
    decisions: dict[str, Decision]
    explanations: dict[str, Explanation]
    ai_cached: dict[str, dict[str, bool]]
    # stage 7
    ranked: list[dict[str, Any]]
    summary: dict[str, Any]
    # transversal: human-readable detail per stage, shown in the UI stepper
    stage_notes: dict[str, str]
