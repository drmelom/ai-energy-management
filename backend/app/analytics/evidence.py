"""Evidence objects shared by detectors, AI providers and the API.

Numbers are formatted exactly once here (text_es / text_en). The LLM validator
uses these strings as the allowed set of figures, so never format elsewhere.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EvidenceKind = Literal[
    "CONSUMPTION_DEVIATION",
    "VOLTAGE_OUT_OF_BAND",
    "VOLTAGE_JUMPS",
    "POWER_RESIDUAL_ERRATIC",
    "LOW_POWER_FACTOR",
    "POWER_FACTOR_DROP",
    "VOLTAGE_SAG",
    "CURRENT_CHANGE",
    "EVENT_EXPLAINS",
    "EVENT_CORROBORATES_DQ",
    "EVENT_REPORTED_UNKNOWN",
    "NO_EXPLAINING_EVENT",
    "DURATION_MATCH",
]


@dataclass(frozen=True)
class EventRecord:
    id: int
    meter_id: str
    timestamp: datetime
    type: str
    description: str


class Segment(BaseModel):
    start: datetime
    end: datetime  # inclusive (last affected hour)
    hours: int
    mean_dev_pct: float
    min_dev_pct: float
    max_dev_pct: float
    mean_z: float
    direction: Literal["up", "down"]
    window_kwh: float
    expected_kwh: float


class Evidence(BaseModel):
    kind: EvidenceKind
    weight: Literal["primary", "supporting"]
    window_from: datetime
    window_to: datetime
    observed: float | None = None
    expected: float | None = None
    unit: str | None = None
    deviation_pct: float | None = None
    share_pct: float | None = None
    event_id: int | None = None
    text_es: str
    text_en: str


class Candidate(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    meter_id: str
    segment: Segment | None = None
    dq_score: int = 0
    dq_signals: dict[str, bool] = Field(default_factory=dict)
    evidence: list[Evidence] = Field(default_factory=list)
    explaining_event: EventRecord | None = None
    events: list[tuple[EventRecord, str]] = Field(default_factory=list)  # (event, relation)
    metrics: dict[str, float] = Field(default_factory=dict)

    @property
    def has_findings(self) -> bool:
        return self.segment is not None or self.dq_score >= 2

    def evidence_text(self, lang: Literal["es", "en"]) -> str:
        key = "text_es" if lang == "es" else "text_en"
        return "\n".join(f"- {getattr(e, key)}" for e in self.evidence)


# ---------- formatting (done once, here) ----------

def fmt_num(x: float, lang: str, decimals: int = 1) -> str:
    s = f"{x:,.{decimals}f}"
    if lang == "es":
        s = s.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return s


def fmt_ts(t: datetime, lang: str) -> str:
    return t.strftime("%d/%m %H:%M") if lang == "es" else t.strftime("%Y-%m-%d %H:%M")


def consumption_deviation(seg: Segment) -> Evidence:
    per_day = 24 / seg.hours
    obs, exp = seg.window_kwh * per_day, seg.expected_kwh * per_day
    pct = abs(seg.mean_dev_pct)
    up = seg.direction == "up"
    return Evidence(
        kind="CONSUMPTION_DEVIATION", weight="primary",
        window_from=seg.start, window_to=seg.end,
        observed=round(obs, 1), expected=round(exp, 1), unit="kWh/día",
        deviation_pct=round(seg.mean_dev_pct, 1),
        text_es=(
            f"El consumo medio en la ventana {fmt_ts(seg.start, 'es')} – {fmt_ts(seg.end, 'es')} ({seg.hours} h) es un "
            f"{fmt_num(pct, 'es')} % {'superior' if up else 'inferior'} al baseline horario "
            f"(≈ {fmt_num(obs, 'es', 0)} kWh/día frente a ≈ {fmt_num(exp, 'es', 0)} kWh/día)."
        ),
        text_en=(
            f"Average consumption during {fmt_ts(seg.start, 'en')} – {fmt_ts(seg.end, 'en')} ({seg.hours} h) is "
            f"{fmt_num(pct, 'en')}% {'above' if up else 'below'} the hourly baseline "
            f"(~{fmt_num(obs, 'en', 0)} kWh/day vs ~{fmt_num(exp, 'en', 0)} kWh/day)."
        ),
    )


def voltage_out_of_band(w0: datetime, w1: datetime, n: int, share: float,
                        vmin: float, vmax: float, lo: float, hi: float) -> Evidence:
    return Evidence(
        kind="VOLTAGE_OUT_OF_BAND", weight="primary", window_from=w0, window_to=w1,
        observed=round(vmax, 1), expected=round((lo + hi) / 2, 1), unit="V", share_pct=round(share, 1),
        text_es=(
            f"En {n} horas ({fmt_num(share, 'es')} % de la ventana) la tensión salió de la banda ±5 % "
            f"({fmt_num(lo, 'es', 0)}–{fmt_num(hi, 'es', 0)} V), con lecturas entre "
            f"{fmt_num(vmin, 'es')} y {fmt_num(vmax, 'es')} V."
        ),
        text_en=(
            f"In {n} hours ({fmt_num(share, 'en')}% of the window) voltage left the ±5% band "
            f"({fmt_num(lo, 'en', 0)}–{fmt_num(hi, 'en', 0)} V), with readings between "
            f"{fmt_num(vmin, 'en')} and {fmt_num(vmax, 'en')} V."
        ),
    )


def voltage_jumps(w0: datetime, w1: datetime, n: int, share: float, max_jump: float, thr: float) -> Evidence:
    return Evidence(
        kind="VOLTAGE_JUMPS", weight="primary", window_from=w0, window_to=w1,
        observed=round(max_jump, 1), expected=thr, unit="V", share_pct=round(share, 1),
        text_es=(
            f"{n} saltos de tensión mayores de {fmt_num(thr, 'es', 0)} V entre horas consecutivas "
            f"({fmt_num(share, 'es')} % de la ventana), el mayor de {fmt_num(max_jump, 'es')} V."
        ),
        text_en=(
            f"{n} voltage jumps above {fmt_num(thr, 'en', 0)} V between consecutive hours "
            f"({fmt_num(share, 'en')}% of the window), the largest {fmt_num(max_jump, 'en')} V."
        ),
    )


def power_residual_erratic(w0: datetime, w1: datetime, res_min: float, res_max: float) -> Evidence:
    return Evidence(
        kind="POWER_RESIDUAL_ERRATIC", weight="primary", window_from=w0, window_to=w1,
        observed=round(res_max * 100, 1), expected=round(res_min * 100, 1), unit="%",
        text_es=(
            "La relación entre energía medida y V·I·PF es incoherente: el residuo cambia de signo hora a hora "
            f"(de {fmt_num(res_min * 100, 'es', 0)} % a +{fmt_num(res_max * 100, 'es', 0)} %), "
            "físicamente imposible en un medidor sano."
        ),
        text_en=(
            "Measured energy is inconsistent with V·I·PF: the residual flips sign hour to hour "
            f"(from {fmt_num(res_min * 100, 'en', 0)}% to +{fmt_num(res_max * 100, 'en', 0)}%), "
            "physically impossible for a healthy meter."
        ),
    )


def low_power_factor(w0: datetime, w1: datetime, n: int, share: float, pf_min: float, floor: float) -> Evidence:
    return Evidence(
        kind="LOW_POWER_FACTOR", weight="supporting", window_from=w0, window_to=w1,
        observed=round(pf_min, 2), expected=floor, unit="", share_pct=round(share, 1),
        text_es=(
            f"Factor de potencia por debajo de {fmt_num(floor, 'es', 2)} en {n} horas "
            f"({fmt_num(share, 'es')} %), mínimo {fmt_num(pf_min, 'es', 2)}."
        ),
        text_en=(
            f"Power factor below {fmt_num(floor, 'en', 2)} in {n} hours "
            f"({fmt_num(share, 'en')}%), minimum {fmt_num(pf_min, 'en', 2)}."
        ),
    )


def power_factor_drop(seg: Segment, before: float, after: float) -> Evidence:
    return Evidence(
        kind="POWER_FACTOR_DROP", weight="supporting", window_from=seg.start, window_to=seg.end,
        observed=round(after, 2), expected=round(before, 2), unit="",
        text_es=f"El factor de potencia cayó de {fmt_num(before, 'es', 2)} a {fmt_num(after, 'es', 2)} durante la ventana.",
        text_en=f"Power factor dropped from {fmt_num(before, 'en', 2)} to {fmt_num(after, 'en', 2)} during the window.",
    )


def voltage_sag(seg: Segment, before: float, after: float) -> Evidence:
    return Evidence(
        kind="VOLTAGE_SAG", weight="supporting", window_from=seg.start, window_to=seg.end,
        observed=round(after, 1), expected=round(before, 1), unit="V",
        text_es=f"La tensión media bajó de {fmt_num(before, 'es')} V a {fmt_num(after, 'es')} V durante la ventana.",
        text_en=f"Mean voltage fell from {fmt_num(before, 'en')} V to {fmt_num(after, 'en')} V during the window.",
    )


def current_change(seg: Segment, before: float, after: float, coherent: bool) -> Evidence:
    pct = (after / before - 1) * 100 if before else 0.0
    sign = "+" if pct > 0 else ""
    return Evidence(
        kind="CURRENT_CHANGE", weight="supporting", window_from=seg.start, window_to=seg.end,
        observed=round(after, 1), expected=round(before, 1), unit="A", deviation_pct=round(pct, 1),
        text_es=(
            f"La corriente media pasó de {fmt_num(before, 'es', 0)} A a {fmt_num(after, 'es', 0)} A "
            f"({sign}{fmt_num(pct, 'es', 0)} %), "
            + ("coherente con el cambio de consumo." if coherent else "no coherente con el cambio de consumo.")
        ),
        text_en=(
            f"Mean current went from {fmt_num(before, 'en', 0)} A to {fmt_num(after, 'en', 0)} A "
            f"({sign}{fmt_num(pct, 'en', 0)}%), "
            + ("consistent with the consumption change." if coherent else "not consistent with the consumption change.")
        ),
    )


def event_evidence(kind: EvidenceKind, ev: EventRecord, anchor: datetime, lag_h: float) -> Evidence:
    lag_es = f"{fmt_num(lag_h, 'es', 0)} h respecto al inicio"
    lag_en = f"{fmt_num(lag_h, 'en', 0)} h from onset"
    texts = {
        "EVENT_EXPLAINS": (
            f"Evento {ev.type} registrado el {fmt_ts(ev.timestamp, 'es')} ({lag_es}): «{ev.description}». Explica el cambio.",
            f'Event {ev.type} registered at {fmt_ts(ev.timestamp, "en")} ({lag_en}): "{ev.description}". It explains the change.',
        ),
        "EVENT_CORROBORATES_DQ": (
            f"Evento DATA_QUALITY registrado el {fmt_ts(ev.timestamp, 'es')}: «{ev.description}». Corrobora el problema de medida.",
            f'DATA_QUALITY event registered at {fmt_ts(ev.timestamp, "en")}: "{ev.description}". It corroborates the metering problem.',
        ),
        "EVENT_REPORTED_UNKNOWN": (
            f"Evento de tipo UNKNOWN registrado el {fmt_ts(ev.timestamp, 'es')}: «{ev.description}». No explica el cambio.",
            f'Event of type UNKNOWN registered at {fmt_ts(ev.timestamp, "en")}: "{ev.description}". It does not explain the change.',
        ),
    }
    es, en = texts[kind]
    return Evidence(
        kind=kind, weight="primary" if kind == "EVENT_EXPLAINS" else "supporting",
        window_from=anchor, window_to=ev.timestamp, event_id=ev.id, text_es=es, text_en=en,
    )


def no_explaining_event(w0: datetime, w1: datetime) -> Evidence:
    return Evidence(
        kind="NO_EXPLAINING_EVENT", weight="primary", window_from=w0, window_to=w1,
        text_es="Ningún evento operativo conocido explica el cambio.",
        text_en="No known operational event explains the change.",
    )


def duration_match(seg: Segment, declared_h: int, ev: EventRecord) -> Evidence:
    return Evidence(
        kind="DURATION_MATCH", weight="supporting", window_from=seg.start, window_to=seg.end,
        observed=seg.hours, expected=declared_h, unit="h", event_id=ev.id,
        text_es=f"La duración observada ({seg.hours} h) coincide con la declarada en el evento ({declared_h} h).",
        text_en=f"The observed duration ({seg.hours} h) matches the duration declared in the event ({declared_h} h).",
    )
