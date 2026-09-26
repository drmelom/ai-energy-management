"""Scalability / generalisation check: the analytics must find injected anomalies in a much larger,
randomly generated fleet (different sizes, noise, onset hours) and stay quiet on the healthy meters.

This is the answer to "would it work with more data?": 60 meters x 30 days = 43,200 readings,
12 injected anomalies of the four kinds at random positions, run with the rules provider (no network).
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from app.ai.rules import decide_by_rules
from app.analytics.baseline import compute_baselines, prepare
from app.analytics.correlation import enrich
from app.analytics.detectors import Thresholds, build_candidates
from app.analytics.evidence import EventRecord

N_METERS, N_DAYS, SEED = 60, 30, 7
START = datetime(2026, 1, 1)


def fleet(n_meters: int, n_days: int, rng: np.random.Generator) -> pd.DataFrame:
    """Healthy fleet: each meter has its own size (10..80 kWh night level), noise 3-6 %, PF 0.88-0.96."""
    ts = pd.date_range(START, periods=24 * n_days, freq="h")
    hour = ts.hour.values
    frames = []
    for i in range(n_meters):
        night = rng.uniform(10, 80)
        shape = np.where(hour < 6, 1.0, np.where((hour >= 8) & (hour < 18), rng.uniform(1.4, 1.8), rng.uniform(1.2, 1.35)))
        noise = rng.uniform(0.03, 0.06)
        kwh = night * shape * (1 + rng.normal(0, noise, len(ts)))
        v = 220 + rng.normal(0, 1.3, len(ts))
        pf = rng.uniform(0.88, 0.96) + rng.normal(0, 0.015, len(ts))
        i_a = kwh * 1000 / (v * pf) * 1.06
        frames.append(pd.DataFrame({"meter_id": f"S-{i + 1:03d}", "timestamp": ts, "consumption_kwh": kwh, "voltage_v": v,
                                    "current_a": i_a, "power_factor": pf, "status": "OK"}))
    return pd.concat(frames, ignore_index=True)


def inject(df: pd.DataFrame, rng: np.random.Generator) -> tuple[dict[str, str], list[EventRecord]]:
    """Inject 3 meters of each kind at random onsets after the baseline week. Returns truth + events."""
    truth: dict[str, str] = {}
    events: list[EventRecord] = []
    meters = list(df["meter_id"].unique())
    picks = rng.choice(meters, size=12, replace=False)
    kinds = ["REAL_ANOMALY"] * 3 + ["EXPLAINABLE_ANOMALY"] * 3 + ["FALSE_POSITIVE"] * 3 + ["DATA_QUALITY"] * 3
    for eid, (m, kind) in enumerate(zip(picks, kinds), start=1):
        idx = df.index[df["meter_id"] == m]
        onset = START + timedelta(days=int(rng.integers(8, N_DAYS - 3)), hours=int(rng.integers(0, 24)))
        sel = idx[df.loc[idx, "timestamp"] >= onset]
        truth[m] = kind
        if kind == "REAL_ANOMALY":
            f = rng.uniform(1.6, 2.5)
            df.loc[sel, "consumption_kwh"] *= f
            df.loc[sel, "current_a"] *= f
            df.loc[sel, "power_factor"] -= rng.uniform(0.12, 0.25)
            events.append(EventRecord(eid, m, onset, "UNKNOWN", "No operational event reported"))
        elif kind == "EXPLAINABLE_ANOMALY":
            f = rng.uniform(1.35, 1.9)
            df.loc[sel, "consumption_kwh"] *= f
            df.loc[sel, "current_a"] *= f
            events.append(EventRecord(eid, m, onset, "OPERATIONAL_CHANGE", "New production line activated"))
        elif kind == "FALSE_POSITIVE":
            hours = int(rng.integers(8, 16))
            win = idx[(df.loc[idx, "timestamp"] >= onset) & (df.loc[idx, "timestamp"] < onset + timedelta(hours=hours))]
            df.loc[win, "consumption_kwh"] *= 0.15
            df.loc[win, "current_a"] *= 0.15
            events.append(EventRecord(eid, m, onset, "SCHEDULED_OUTAGE", f"Scheduled maintenance outage for {hours} hours"))
        else:  # DATA_QUALITY: every 3rd hour a bad reading, consumption untouched
            bad = sel[(np.arange(len(sel)) % 3) == 0]
            sign = np.where(np.arange(len(bad)) % 2 == 0, 1, -1)
            df.loc[bad, "voltage_v"] += sign * rng.uniform(15, 25, len(bad))
            df.loc[bad, "power_factor"] = rng.uniform(0.55, 0.7, len(bad))
            df.loc[bad, "current_a"] *= np.where(sign > 0, rng.uniform(2.0, 3.0), rng.uniform(0.3, 0.5))
            events.append(EventRecord(eid, m, onset, "DATA_QUALITY", "Intermittent readings and abnormal electrical jumps"))
    return truth, events


@pytest.fixture(scope="module")
def run_large():
    rng = np.random.default_rng(SEED)
    raw = fleet(N_METERS, N_DAYS, rng)
    truth, events = inject(raw, rng)
    t0 = time.perf_counter()
    df = prepare(raw)
    baselines = compute_baselines(df)
    cands = enrich(build_candidates(df, baselines, Thresholds()), df, baselines, events)
    elapsed = time.perf_counter() - t0
    decided = {c.meter_id: decide_by_rules(c) for c in cands if c.has_findings}
    return raw, truth, decided, elapsed


def test_fleet_size(run_large):
    raw, *_ = run_large
    assert len(raw) == N_METERS * N_DAYS * 24 == 43_200


def test_every_injected_anomaly_is_found_with_the_right_type(run_large):
    _, truth, decided, _ = run_large
    missed = {m: k for m, k in truth.items() if m not in decided}
    wrong = {m: (k, decided[m].type) for m, k in truth.items() if m in decided and decided[m].type != k}
    assert not missed, f"not detected: {missed}"
    assert not wrong, f"wrong type: {wrong}"


def test_no_false_positives_on_healthy_meters(run_large):
    _, truth, decided, _ = run_large
    extra = sorted(set(decided) - set(truth))
    assert extra == [], f"healthy meters flagged: {extra}"


def test_priority_and_severity_follow_the_kind(run_large):
    _, truth, decided, _ = run_large
    for m, kind in truth.items():
        d = decided[m]
        if kind in ("REAL_ANOMALY", "DATA_QUALITY"):
            assert d.severity == "HIGH" and d.priority, (m, kind, d.severity, d.priority)
        elif kind == "FALSE_POSITIVE":
            assert d.severity == "LOW" and not d.priority
        else:
            assert d.severity in ("MEDIUM", "LOW") and not d.priority


def test_analytics_stay_fast_at_10x_the_dataset(run_large):
    *_, elapsed = run_large
    assert elapsed < 15, f"analytics took {elapsed:.1f}s for 43,200 readings"
