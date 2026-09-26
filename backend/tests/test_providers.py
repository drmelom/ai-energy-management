"""Rules decider, guardrails, number validator and fallbacks. No network."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pandas as pd
import pytest

from app.ai.factory import DecisionWithFallback, ExplanationWithFallback, build_providers
from app.ai.jev import to_jev_state
from app.ai.openrouter import numbers_are_grounded
from app.ai.ports import Decision, ProviderError
from app.ai.rules import decide_by_rules, violates_guardrail
from app.ai.templates import explain_by_template
from app.analytics.baseline import compute_baselines, prepare
from app.analytics.correlation import enrich, events_from_frame
from app.analytics.detectors import build_candidates
from app.config import Settings

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture(scope="module")
def cands():
    df = prepare(pd.read_csv(DATA / "readings.csv"))
    ev = events_from_frame(pd.read_csv(DATA / "events.csv"))
    b = compute_baselines(df)
    return {c.meter_id: c for c in enrich(build_candidates(df, b), df, b, ev) if c.has_findings}


def test_rules_reproduce_ground_truth(cands):
    got = {m: (d.type, d.severity, d.priority, d.confidence) for m, d in ((m, decide_by_rules(c)) for m, c in cands.items())}
    assert got["M-109"] == ("REAL_ANOMALY", "HIGH", True, 0.97)
    assert got["M-112"] == ("DATA_QUALITY", "HIGH", True, 0.95)
    assert got["M-106"] == ("FALSE_POSITIVE", "LOW", False, 0.90)
    assert got["M-104"] == ("EXPLAINABLE_ANOMALY", "MEDIUM", False, 0.85)


def test_guardrails(cands):
    bad = Decision(type="EXPLAINABLE_ANOMALY", severity="LOW", priority=False, confidence=0.9, provider="jev")
    assert violates_guardrail(cands["M-109"], bad) == "guardrail:G1"
    bad_dq = Decision(type="DATA_QUALITY", severity="HIGH", priority=True, confidence=0.9, provider="jev")
    assert violates_guardrail(cands["M-109"], bad_dq) == "guardrail:G2"
    ok = Decision(type="REAL_ANOMALY", severity="HIGH", priority=True, confidence=0.9, provider="jev")
    assert violates_guardrail(cands["M-109"], ok) is None


def test_templates_have_no_placeholders(cands):
    for c in cands.values():
        e = explain_by_template(c, decide_by_rules(c))
        assert "{" not in e.reason and e.reason.endswith(".") and e.recommended_action
        assert e.provider == "template"


def test_jev_state_is_english_and_mentions_absent_signals(cands):
    s = to_jev_state(cands["M-109"])
    assert "110.4% above" in s and "UNKNOWN" in s and "No operational change" in s
    assert "within the ±5% band" in s  # negative findings are stated explicitly
    assert "kWh/día" not in s


def test_number_validator():
    ev = "El consumo es un 110,4 % superior (≈ 2.227 kWh/día frente a ≈ 1.058 kWh/día). PF cayó de 0,94 a 0,74."
    assert numbers_are_grounded("Consumo 110,4 % sobre baseline; el PF bajó a 0,74.", ev)
    assert numbers_are_grounded("Consumo 110.4% sobre 2227 kWh/día.", ev)  # en-style spelling of the same figures
    assert not numbers_are_grounded("Consumo 103,7 % por encima del baseline.", ev)  # PDF figure, not in evidence
    assert not numbers_are_grounded("Baseline de 1.070 kWh.", ev)


class _Boom:
    name = "jev"

    def __init__(self, note, retryable):
        self.calls, self.note, self.retryable = 0, note, retryable

    async def decide(self, c):
        self.calls += 1
        raise ProviderError(self.note, self.retryable)

    async def explain(self, c, d):
        self.calls += 1
        raise ProviderError(self.note, self.retryable)


def test_decision_fallback_records_note_and_retries_only_when_retryable(cands, monkeypatch):
    async def _nosleep(_s):
        return None

    monkeypatch.setattr("app.ai.factory.asyncio.sleep", _nosleep)
    p = _Boom("jev:auth", retryable=False)
    d = asyncio.run(DecisionWithFallback(p, 5).decide(cands["M-109"]))
    assert d.provider == "rules" and d.notes == ["jev:auth"] and p.calls == 1
    p2 = _Boom("jev:timeout", retryable=True)
    d2 = asyncio.run(DecisionWithFallback(p2, 5).decide(cands["M-104"]))
    assert d2.provider == "rules" and p2.calls == 2 and d2.type == "EXPLAINABLE_ANOMALY"


def test_explanation_fallback(cands):
    p = _Boom("llm:invalid_numbers", retryable=False)
    d = decide_by_rules(cands["M-112"])
    e = asyncio.run(ExplanationWithFallback(p, 5).explain(cands["M-112"], d))
    assert e.provider == "template" and e.notes == ["llm:invalid_numbers"]


def test_build_providers_without_keys_is_offline():
    s = Settings(_env_file=None, openrouter_api_key=None, jev_api_key=None)
    dec, exp = build_providers(s)
    assert dec.name == "rules" and exp.name == "template"
    assert s.decision_mode == "rules" and s.explanation_mode == "template"


def test_settings_parse_csv_lists():
    s = Settings(_env_file=None, cors_origins="http://a,http://b", llm_models="x/y:free, z/w:free", openrouter_api_key="k")
    assert s.cors_origins == ["http://a", "http://b"] and s.llm_models == ["x/y:free", "z/w:free"]
    assert s.decision_mode == "jev"  # jev key falls back to the OpenRouter key
