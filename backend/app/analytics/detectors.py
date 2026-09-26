"""Consumption-segment detector and data-quality signals. Pure pandas, no IO.

Thresholds were validated against the real dataset (docs/DATA_ANALYSIS.md §5,
backend/ARCHITECTURE.md §6): every rule fires on its target case and none fires
on the 8 normal meters, with the worst normal meter roughly half-way to each
threshold.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.analytics import evidence as ev
from app.analytics.baseline import BaselineProfile, meter_metrics, with_deviation
from app.analytics.evidence import Candidate, Segment


@dataclass(frozen=True)
class Thresholds:
    # consumption segment
    dev_min: float = 0.25          # |dev| >= 25 % per hour
    min_hours: int = 6             # >= 6 consecutive hours
    max_gap_hours: int = 2         # merge runs separated by <= 2 h
    # data quality signals (nominal 220 V; ±10 % would NOT catch M-112)
    v_nominal: float = 220.0
    v_band_pct: float = 0.05
    v_jump: float = 10.0
    residual_abs: float = 0.20
    residual_min_hours: int = 2
    share_min: float = 0.02        # >= 2 % of evaluation hours
    pf_floor: float = 0.80
    dq_score_min: int = 2
    # electrical context of a segment
    pf_drop: float = 0.10
    v_sag: float = 2.0
    current_change: float = 0.25
    # events
    event_window_hours: float = 24.0


def _runs(mask: pd.Series, max_gap: int) -> list[tuple[int, int]]:
    """Return (start_idx, end_idx) inclusive positional runs of True, merging gaps <= max_gap."""
    idx = [i for i, v in enumerate(mask.tolist()) if v]
    if not idx:
        return []
    runs: list[list[int]] = [[idx[0], idx[0]]]
    for i in idx[1:]:
        if i - runs[-1][1] - 1 <= max_gap:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(a, b) for a, b in runs]


def detect_segment(dfe: pd.DataFrame, th: Thresholds) -> Segment | None:
    """dfe: single-meter evaluation-window frame WITH deviation columns (with_deviation)."""
    if dfe.empty:
        return None
    dfe = dfe.reset_index(drop=True)
    best: Segment | None = None
    for sign in (1, -1):
        mask = (dfe["dev"] * sign) >= th.dev_min
        for a, b in _runs(mask, th.max_gap_hours):
            seg = dfe.iloc[a : b + 1]
            if len(seg) < th.min_hours:
                continue
            mean_dev = float(seg["dev"].mean())
            cand = Segment(
                start=seg["timestamp"].iloc[0].to_pydatetime(),
                end=seg["timestamp"].iloc[-1].to_pydatetime(),
                hours=int(len(seg)),
                mean_dev_pct=round(mean_dev * 100, 1),
                min_dev_pct=round(float(seg["dev"].min()) * 100, 1),
                max_dev_pct=round(float(seg["dev"].max()) * 100, 1),
                mean_z=round(float(seg["z"].mean()), 1),
                direction="up" if mean_dev > 0 else "down",
                window_kwh=round(float(seg["consumption_kwh"].sum()), 1),
                expected_kwh=round(float(seg["expected_kwh"].sum()), 1),
            )
            if best is None or abs(cand.mean_dev_pct) > abs(best.mean_dev_pct):
                best = cand
    return best


def detect_data_quality(dfe: pd.DataFrame, th: Thresholds) -> tuple[int, dict[str, bool], list[ev.Evidence]]:
    """Signals S1 (V out of band), S2 (V jumps), S3 (residual flips sign). S4 (low PF) is supporting only."""
    n = len(dfe)
    if n == 0:
        return 0, {}, []
    dfe = dfe.reset_index(drop=True)
    lo, hi = th.v_nominal * (1 - th.v_band_pct), th.v_nominal * (1 + th.v_band_pct)

    out_band = (dfe["voltage_v"] < lo) | (dfe["voltage_v"] > hi)
    dv = dfe["voltage_v"].diff().abs()
    jumps = dv > th.v_jump
    calc = dfe["voltage_v"] * dfe["current_a"] * dfe["power_factor"] / 1000.0
    res = (dfe["consumption_kwh"] - calc) / dfe["consumption_kwh"]
    res_pos, res_neg = res > th.residual_abs, res < -th.residual_abs
    low_pf = dfe["power_factor"] < th.pf_floor

    s1 = out_band.mean() >= th.share_min
    s2 = jumps.mean() >= th.share_min
    s3 = res_pos.sum() >= th.residual_min_hours and res_neg.sum() >= th.residual_min_hours
    s4 = low_pf.mean() >= th.share_min
    signals = {"voltage_out_of_band": bool(s1), "voltage_jumps": bool(s2), "residual_erratic": bool(s3), "low_power_factor": bool(s4)}
    score = int(s1) + int(s2) + int(s3)

    # window = hours with the strong signals (V out of band / V jumps) when those fired; the residual alone
    # flags sporadic hours in healthy periods (bias +6 %, sigma ~5 %) and would drag the window backwards.
    flagged = (out_band | jumps) if (s1 or s2) else (res_pos | res_neg)
    if not flagged.any():
        return score, signals, []
    w0 = dfe.loc[flagged, "timestamp"].iloc[0].to_pydatetime()
    w1 = dfe.loc[flagged, "timestamp"].iloc[-1].to_pydatetime()

    items: list[ev.Evidence] = []
    if s1:
        v = dfe.loc[out_band, "voltage_v"]
        items.append(ev.voltage_out_of_band(w0, w1, int(out_band.sum()), out_band.mean() * 100, float(v.min()), float(v.max()), lo, hi))
    if s2:
        items.append(ev.voltage_jumps(w0, w1, int(jumps.sum()), jumps.mean() * 100, float(dv.max()), th.v_jump))
    if s3:
        items.append(ev.power_residual_erratic(w0, w1, float(res.min()), float(res.max())))
    if s4 and score >= th.dq_score_min:
        items.append(ev.low_power_factor(w0, w1, int(low_pf.sum()), low_pf.mean() * 100, float(dfe["power_factor"].min()), th.pf_floor))
    return score, signals, items


def build_candidates(df: pd.DataFrame, baselines: dict[str, BaselineProfile], th: Thresholds = Thresholds()) -> list[Candidate]:
    """One Candidate per meter (normals included, with metrics only). Evaluation window = after baseline."""
    out: list[Candidate] = []
    for meter_id, dfm in df.groupby("meter_id", sort=True):
        bp = baselines[str(meter_id)]
        dfe = with_deviation(dfm[dfm["timestamp"] > bp.window_end], bp)
        seg = detect_segment(dfe, th)
        score, signals, dq_items = detect_data_quality(dfe, th)
        c = Candidate(meter_id=str(meter_id), segment=seg, dq_score=score, dq_signals=signals, metrics=meter_metrics(dfm, bp))
        if seg is not None:
            c.evidence.append(ev.consumption_deviation(seg))
        # a consumption anomaly with PF/residual side-effects (M-109) is physics, not bad data:
        # DQ evidence only counts when the score reaches the threshold on its own.
        if score >= th.dq_score_min:
            c.evidence.extend(dq_items)
        out.append(c)
    return out
