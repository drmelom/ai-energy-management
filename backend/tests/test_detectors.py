"""Unit tests on synthetic series + the ground-truth regression on the real CSVs."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.analytics.baseline import compute_baselines, meter_metrics, prepare, with_deviation
from app.analytics.correlation import enrich, events_from_frame
from app.analytics.detectors import Thresholds, build_candidates, detect_data_quality, detect_segment

DATA = Path(__file__).resolve().parents[1] / "data"


def synthetic(meter="M-1", days=14, seed=0):
    """Flat 3-step daily profile (night 20 / shoulder 26 / day 32 kWh) with 3 % noise, healthy electrics."""
    rng = np.random.default_rng(seed)
    ts = pd.date_range("2026-09-01", periods=24 * days, freq="h")
    hour = ts.hour
    base = np.where(hour < 6, 20.0, np.where((hour >= 8) & (hour < 18), 32.0, 26.0))
    kwh = base * (1 + rng.normal(0, 0.03, len(ts)))
    v = 220 + rng.normal(0, 1.2, len(ts))
    pf = 0.94 + rng.normal(0, 0.015, len(ts))
    i = kwh * 1000 / (v * pf) * 1.06  # +6 % identity bias as in the real data
    return pd.DataFrame({"meter_id": meter, "timestamp": ts, "consumption_kwh": kwh, "voltage_v": v,
                         "current_a": i, "power_factor": pf, "status": "OK"})


def _eval_frame(raw):
    df = prepare(raw)
    bp = compute_baselines(df)[raw["meter_id"].iloc[0]]
    return with_deviation(df[df["timestamp"] > bp.window_end], bp), bp


def test_normal_series_has_no_findings():
    dfe, _ = _eval_frame(synthetic())
    assert detect_segment(dfe, Thresholds()) is None
    score, _, items = detect_data_quality(dfe, Thresholds())
    assert score == 0 and items == []


def test_step_up_is_detected_with_correct_window():
    raw = synthetic()
    onset = pd.Timestamp("2026-09-12 14:00")
    m = raw["timestamp"] >= onset
    raw.loc[m, "consumption_kwh"] *= 2.1
    raw.loc[m, "current_a"] *= 2.1
    dfe, _ = _eval_frame(raw)
    seg = detect_segment(dfe, Thresholds())
    assert seg is not None and seg.direction == "up"
    assert seg.start == onset.to_pydatetime() and seg.hours == 58
    assert 100 < seg.mean_dev_pct < 120


def test_short_spike_below_min_hours_is_ignored():
    raw = synthetic()
    m = (raw["timestamp"] >= "2026-09-10 10:00") & (raw["timestamp"] < "2026-09-10 14:00")  # 4 h
    raw.loc[m, "consumption_kwh"] *= 3
    dfe, _ = _eval_frame(raw)
    assert detect_segment(dfe, Thresholds()) is None


def test_intermittent_electrical_noise_is_data_quality_not_consumption():
    raw = synthetic()
    bad = (raw["timestamp"] >= "2026-09-13") & (raw["timestamp"].dt.hour % 3 == 0)
    raw.loc[bad, "voltage_v"] += np.where(np.arange(bad.sum()) % 2 == 0, 20, -18)
    raw.loc[bad, "power_factor"] = 0.6
    raw.loc[bad, "current_a"] *= np.where(np.arange(bad.sum()) % 2 == 0, 2.5, 0.5)
    dfe, _ = _eval_frame(raw)
    assert detect_segment(dfe, Thresholds()) is None
    score, signals, items = detect_data_quality(dfe, Thresholds())
    assert score >= 2 and signals["voltage_out_of_band"] and signals["voltage_jumps"]
    assert {e.kind for e in items} >= {"VOLTAGE_OUT_OF_BAND", "VOLTAGE_JUMPS"}


# ---------------- ground truth on the real dataset ----------------

@pytest.fixture(scope="module")
def real_candidates():
    df = prepare(pd.read_csv(DATA / "readings.csv"))
    events = events_from_frame(pd.read_csv(DATA / "events.csv"))
    baselines = compute_baselines(df)
    return {c.meter_id: c for c in enrich(build_candidates(df, baselines), df, baselines, events)}


def test_only_the_four_cases_have_findings(real_candidates):
    assert sorted(m for m, c in real_candidates.items() if c.has_findings) == ["M-104", "M-106", "M-109", "M-112"]


def test_m109_real_anomaly_evidence(real_candidates):
    c = real_candidates["M-109"]
    assert c.segment.direction == "up" and c.segment.hours == 58
    assert c.segment.start == pd.Timestamp("2026-09-12 14:00").to_pydatetime()
    assert 105 <= c.segment.mean_dev_pct <= 115
    assert c.dq_score == 0, "PF drop + biased residual are physics, not bad data"
    kinds = {e.kind for e in c.evidence}
    assert {"CONSUMPTION_DEVIATION", "POWER_FACTOR_DROP", "VOLTAGE_SAG", "CURRENT_CHANGE",
            "EVENT_REPORTED_UNKNOWN", "NO_EXPLAINING_EVENT"} <= kinds
    assert c.explaining_event is None


def test_m104_explained_by_operational_change(real_candidates):
    c = real_candidates["M-104"]
    assert c.segment.direction == "up" and c.segment.hours == 96 and 40 <= c.segment.mean_dev_pct <= 50
    assert c.explaining_event is not None and c.explaining_event.type == "OPERATIONAL_CHANGE"
    kinds = {e.kind for e in c.evidence}
    assert "EVENT_EXPLAINS" in kinds and "POWER_FACTOR_DROP" not in kinds and "VOLTAGE_SAG" not in kinds


def test_m106_outage_matches_declared_duration(real_candidates):
    c = real_candidates["M-106"]
    assert c.segment.direction == "down" and c.segment.hours == 12 and c.segment.mean_dev_pct < -75
    assert c.explaining_event is not None and c.explaining_event.type == "SCHEDULED_OUTAGE"
    assert {"EVENT_EXPLAINS", "DURATION_MATCH"} <= {e.kind for e in c.evidence}


def test_m112_data_quality_without_consumption_anomaly(real_candidates):
    c = real_candidates["M-112"]
    assert c.segment is None and c.dq_score == 3
    assert min(e.window_from for e in c.evidence) == pd.Timestamp("2026-09-13 00:00").to_pydatetime(), "DQ window starts at the onset, not at a sporadic residual hour"
    kinds = {e.kind for e in c.evidence}
    assert {"VOLTAGE_OUT_OF_BAND", "VOLTAGE_JUMPS", "POWER_RESIDUAL_ERRATIC", "LOW_POWER_FACTOR", "EVENT_CORROBORATES_DQ"} <= kinds
    assert abs(c.metrics["variation_pct"]) < 2


def test_variation_pct_matches_pdf_definition(real_candidates):
    # last day vs mean daily total of days 1-7 (docs/DATA_ANALYSIS.md §3.1)
    assert real_candidates["M-104"].metrics["variation_pct"] == pytest.approx(47.5, abs=0.5)
    assert real_candidates["M-109"].metrics["variation_pct"] == pytest.approx(110.5, abs=0.5)
    assert abs(real_candidates["M-101"].metrics["variation_pct"]) < 1


def test_normal_meters_keep_margin_to_thresholds(real_candidates):
    for m in ("M-101", "M-102", "M-103", "M-105", "M-107", "M-108", "M-110", "M-111"):
        c = real_candidates[m]
        assert c.dq_score == 0 and c.segment is None
        assert c.metrics["max_abs_z"] < 4 and abs(c.metrics["variation_pct"]) < 5


def test_evidence_text_formats_numbers_once_in_both_languages(real_candidates):
    e = next(e for e in real_candidates["M-109"].evidence if e.kind == "CONSUMPTION_DEVIATION")
    assert "110," in e.text_es and "110." in e.text_en
    assert "kWh/día" in e.text_es and "kWh/day" in e.text_en
