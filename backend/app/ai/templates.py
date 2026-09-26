"""Spanish explanation templates: fallback when the LLM is unavailable or invents numbers."""
from __future__ import annotations

from app.analytics.evidence import Candidate, fmt_num, fmt_ts
from app.ai.ports import Decision, Explanation


def _ev(c: Candidate, kind: str):
    return next((e for e in c.evidence if e.kind == kind), None)


def explain_by_template(c: Candidate, d: Decision, notes: list[str] | None = None) -> Explanation:
    seg, ev = c.segment, c.explaining_event
    dev = fmt_num(abs(seg.mean_dev_pct), "es") if seg else ""
    if d.type == "REAL_ANOMALY":
        pf = _ev(c, "POWER_FACTOR_DROP")
        clause = f"; el factor de potencia cae de {fmt_num(pf.expected, 'es', 2)} a {fmt_num(pf.observed, 'es', 2)}" if pf else ""
        reason = f"Consumo {dev} % por encima del baseline durante {seg.hours} h sin evento operativo conocido{clause}."
        action = "Investigar el medidor y la instalación: verificar cargas no declaradas y estado del factor de potencia."
    elif d.type == "EXPLAINABLE_ANOMALY":
        reason = (f"Consumo {dev} % por encima del baseline desde {fmt_ts(seg.start, 'es')}, coincidente con el evento "
                  f"«{ev.description}» del {fmt_ts(ev.timestamp, 'es')}.")
        action = "Actualizar el baseline del medidor y revisar la potencia contratada; no requiere intervención en campo."
    elif d.type == "FALSE_POSITIVE":
        reason = (f"Caída del {dev} % durante {seg.hours} h que coincide con «{ev.description}» programado para el "
                  f"{fmt_ts(ev.timestamp, 'es')}; el consumo se recupera al finalizar.")
        action = "Cerrar sin acción y registrar como parada planificada."
    else:  # DATA_QUALITY
        vob, res, pf = _ev(c, "VOLTAGE_OUT_OF_BAND"), _ev(c, "POWER_RESIDUAL_ERRATIC"), _ev(c, "LOW_POWER_FACTOR")
        start = min(e.window_from for e in c.evidence)
        parts = []
        if vob:
            parts.append(f"tensión con lecturas hasta {fmt_num(vob.observed, 'es')} V ({fmt_num(vob.share_pct, 'es')} % de las horas fuera de banda)")
        if pf:
            parts.append(f"factor de potencia mínimo {fmt_num(pf.observed, 'es', 2)}")
        if res:
            parts.append("relación P≈V·I·PF errática")
        reason = f"Lecturas inconsistentes desde {fmt_ts(start, 'es')}: {', '.join(parts)}; el consumo se mantiene estable."
        action = "Revisar el medidor y su comunicación; poner en cuarentena las lecturas del periodo antes de facturar."
    return Explanation(reason=reason, recommended_action=action, provider="template", notes=list(notes or []))

