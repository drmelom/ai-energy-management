"""Hourly-profile baseline per meter. Pure pandas, no IO.

Baseline window = first `baseline_days` calendar days of the dataset (days 1-7).
Evaluation window = everything after. Verified in docs/DATA_ANALYSIS.md: no meter
has a contaminated baseline window and no weekly cycle exists, so a fixed
per-hour-of-day profile is the right model. A rolling baseline would dilute
M-109 from +110% to +71%.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

READING_COLUMNS = ["meter_id", "timestamp", "consumption_kwh", "voltage_v", "current_a", "power_factor"]


@dataclass
class BaselineProfile:
    meter_id: str
    profile: pd.DataFrame  # index hour 0..23; kwh_median, kwh_mean, kwh_std, v_mean, pf_mean, i_mean
    rstd: float            # pooled std of hourly residual (kwh - kwh_median[hour]) over the baseline window
    daily_kwh: float       # mean daily total over the baseline window
    window_start: pd.Timestamp
    window_end: pd.Timestamp

    def expected(self, hours: pd.Series) -> pd.Series:
        return hours.map(self.profile["kwh_median"]).astype(float)


def prepare(readings: pd.DataFrame) -> pd.DataFrame:
    """Normalise dtypes and add `date`, `day` (1-based) and `hour` columns. Sorted by meter, time."""
    missing = [c for c in READING_COLUMNS if c not in readings.columns]
    if missing:
        raise ValueError(f"readings missing columns: {missing}")
    df = readings[READING_COLUMNS].copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    for c in ("consumption_kwh", "voltage_v", "current_a", "power_factor"):
        df[c] = df[c].astype(float)
    df = df.sort_values(["meter_id", "timestamp"]).reset_index(drop=True)
    df["date"] = df["timestamp"].dt.normalize()
    first = df["date"].min()
    df["day"] = (df["date"] - first).dt.days + 1
    df["hour"] = df["timestamp"].dt.hour
    return df


def split_windows(df: pd.DataFrame, baseline_days: int = 7) -> tuple[pd.DataFrame, pd.DataFrame]:
    base = df[df["day"] <= baseline_days]
    eval_ = df[df["day"] > baseline_days]
    return base, eval_


def compute_baselines(df: pd.DataFrame, baseline_days: int = 7) -> dict[str, BaselineProfile]:
    base, _ = split_windows(df, baseline_days)
    out: dict[str, BaselineProfile] = {}
    for meter_id, g in base.groupby("meter_id", sort=True):
        prof = g.groupby("hour").agg(
            kwh_median=("consumption_kwh", "median"),
            kwh_mean=("consumption_kwh", "mean"),
            kwh_std=("consumption_kwh", "std"),
            v_mean=("voltage_v", "mean"),
            pf_mean=("power_factor", "mean"),
            i_mean=("current_a", "mean"),
        ).reindex(range(24))
        resid = g["consumption_kwh"] - g["hour"].map(prof["kwh_median"]).astype(float)
        out[str(meter_id)] = BaselineProfile(
            meter_id=str(meter_id),
            profile=prof,
            rstd=float(resid.std(ddof=0)) or 1e-9,
            daily_kwh=float(g.groupby("date")["consumption_kwh"].sum().mean()),
            window_start=g["timestamp"].min(),
            window_end=g["timestamp"].max(),
        )
    return out


def with_deviation(dfm: pd.DataFrame, bp: BaselineProfile) -> pd.DataFrame:
    """Add expected_kwh, dev (fraction) and z columns to a single-meter frame."""
    out = dfm.copy()
    out["expected_kwh"] = bp.expected(out["hour"])
    out["dev"] = (out["consumption_kwh"] - out["expected_kwh"]) / out["expected_kwh"]
    out["z"] = (out["consumption_kwh"] - out["expected_kwh"]) / bp.rstd
    return out


def meter_metrics(dfm: pd.DataFrame, bp: BaselineProfile) -> dict[str, float]:
    """Headline numbers for the meters list / detail. variation_pct = last day vs baseline daily."""
    daily = dfm.groupby("date")["consumption_kwh"].sum()
    last_day_kwh = float(daily.iloc[-1])
    dev = with_deviation(dfm[dfm["timestamp"] > bp.window_end], bp) if (dfm["timestamp"] > bp.window_end).any() else None
    return {
        "total_kwh": round(float(dfm["consumption_kwh"].sum()), 1),
        "last_day_kwh": round(last_day_kwh, 1),
        "baseline_daily_kwh": round(bp.daily_kwh, 1),
        "variation_pct": round((last_day_kwh / bp.daily_kwh - 1) * 100, 1),
        "max_abs_z": round(float(dev["z"].abs().max()), 2) if dev is not None and len(dev) else 0.0,
        "avg_voltage_v": round(float(dfm["voltage_v"].mean()), 1),
        "avg_power_factor": round(float(dfm["power_factor"].mean()), 3),
    }
