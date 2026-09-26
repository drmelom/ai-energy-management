"""The 7 pipeline stages, one node each. Nodes never touch the DB except stage 1 (read-only);
the runner persists progress and results. Stage 6 is the only one that calls AI providers."""
from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Callable
from typing import Any

import pandas as pd

from app.ai.factory import AiCache, DecisionWithFallback, ExplanationWithFallback
from app.ai.ports import SEVERITY_ORDER, TYPE_ORDER, Decision, Explanation
from app.analytics.baseline import compute_baselines, prepare
from app.analytics.correlation import electrical_context, match_events
from app.analytics.detectors import Thresholds, build_candidates
from app.analytics.evidence import Candidate, EventRecord
from app.pipeline.state import PipelineState

Loader = Callable[[], tuple[pd.DataFrame, list[EventRecord]]]


def _note(state: PipelineState, key: str, text: str) -> dict[str, str]:
    return {**state.get("stage_notes", {}), key: text}


def make_nodes(load: Loader, decide: DecisionWithFallback, explain: ExplanationWithFallback,
               cache: AiCache | None = None, th: Thresholds = Thresholds()) -> dict[str, Callable]:

    def readings(state: PipelineState) -> dict:
        raw, events = load()
        df = prepare(raw)
        if df.empty:
            raise ValueError("No hay lecturas en la base de datos")
        days = df["day"].max()
        note = f"{len(df):,} lecturas · {df['meter_id'].nunique()} medidores · {days} días".replace(",", ".")
        return {"readings": df, "events": events, "stage_notes": _note(state, "readings", note)}

    def baseline(state: PipelineState) -> dict:
        b = compute_baselines(state["readings"])
        note = f"Perfil horario de 7 días para {len(b)} medidores"
        return {"baselines": b, "stage_notes": _note(state, "baseline", note)}

    def detection(state: PipelineState) -> dict:
        cands = build_candidates(state["readings"], state["baselines"], th)
        n_seg = sum(c.segment is not None for c in cands)
        n_dq = sum(c.dq_score >= th.dq_score_min for c in cands)
        note = f"{n_seg} segmentos de consumo · {n_dq} medidor{'es' if n_dq != 1 else ''} con señales de calidad de dato"
        return {"candidates": cands, "stage_notes": _note(state, "detection", note)}

    def correlation(state: PipelineState) -> dict:
        cands = state["candidates"]
        df = state["readings"]
        for c in cands:
            if c.has_findings:
                electrical_context(c, df[df["meter_id"] == c.meter_id], state["baselines"][c.meter_id], th)
        n = sum(c.has_findings for c in cands)
        elec = sum(any(e.kind in ("POWER_FACTOR_DROP", "VOLTAGE_SAG", "CURRENT_CHANGE") for e in c.evidence) for c in cands)
        note = f"Contexto eléctrico calculado para {n} candidatos · {elec} con cambios en V/I/PF"
        return {"candidates": cands, "stage_notes": _note(state, "correlation", note)}

    def events(state: PipelineState) -> dict:
        cands = state["candidates"]
        for c in cands:
            if c.has_findings:
                match_events(c, state["events"], th)
        rel = [r for c in cands for _, r in c.events]
        note = (f"{rel.count('explains')} eventos explican · {rel.count('reported_no_explanation')} reportado sin explicación · "
                f"{rel.count('corroborates_dq')} de calidad de dato")
        return {"candidates": cands, "stage_notes": _note(state, "events", note)}

    async def explanation(state: PipelineState) -> dict:
        cands = [c for c in state["candidates"] if c.has_findings]
        force = state.get("force_refresh", True)
        sem = asyncio.Semaphore(4)

        async def one(c: Candidate) -> tuple[str, Decision, Explanation, dict[str, bool]]:
            async with sem:
                cached = {"decision": False, "explanation": False}
                dkey = _key("decision", decide.name, c.evidence_text("en"))
                d = _from_cache(cache, dkey, Decision) if (cache and not force) else None
                if d is None:
                    d = await decide.decide(c)
                    _to_cache(cache, dkey, "decision", c.meter_id, d)
                else:
                    cached["decision"] = True
                ekey = _key("explanation", explain.name, c.evidence_text("es") + d.type + d.severity)
                e = _from_cache(cache, ekey, Explanation) if (cache and not force) else None
                if e is None:
                    e = await explain.explain(c, d)
                    _to_cache(cache, ekey, "explanation", c.meter_id, e)
                else:
                    cached["explanation"] = True
                return c.meter_id, d, e, cached

        results = await asyncio.gather(*(one(c) for c in cands))
        decisions = {m: d for m, d, _, _ in results}
        explanations = {m: e for m, _, e, _ in results}
        ai_cached = {m: cc for m, _, _, cc in results}
        n_jev = sum(d.provider == "jev" for d in decisions.values())
        n_llm = sum(e.provider.startswith("llm") for e in explanations.values())
        n_cached = sum(any(cc.values()) for cc in ai_cached.values())
        fallback = (len(cands) - n_jev) + (len(cands) - n_llm)
        note = (f"{len(cands)} casos clasificados y explicados por IA"
                + (f" · {fallback} con respaldo determinista" if fallback else "")
                + (f" · {n_cached} desde caché" if n_cached else ""))
        return {"decisions": decisions, "explanations": explanations, "ai_cached": ai_cached,
                "stage_notes": _note(state, "explanation", note)}

    def recommendation(state: PipelineState) -> dict:
        cands = {c.meter_id: c for c in state["candidates"] if c.has_findings}
        rows: list[dict[str, Any]] = []
        for m, c in cands.items():
            d, e = state["decisions"][m], state["explanations"][m]
            rows.append({"candidate": c, "decision": d, "explanation": e, "cached": state.get("ai_cached", {}).get(m, {})})
        rows.sort(key=lambda r: (
            not r["decision"].priority,
            SEVERITY_ORDER.index(r["decision"].severity),
            TYPE_ORDER.index(r["decision"].type),
            -abs(r["candidate"].segment.mean_dev_pct if r["candidate"].segment else 0),
        ))
        for i, r in enumerate(rows, start=1):
            r["rank"] = i
        total, prio = len(rows), sum(r["decision"].priority for r in rows)
        by_type: dict[str, int] = {}
        by_sev: dict[str, int] = {}
        for r in rows:
            by_type[r["decision"].type] = by_type.get(r["decision"].type, 0) + 1
            by_sev[r["decision"].severity] = by_sev.get(r["decision"].severity, 0) + 1
        avg_conf = round(sum(r["decision"].confidence for r in rows) / total, 2) if total else 0.0
        headline = (f"{total} anomalía{'s' if total != 1 else ''} detectada{'s' if total != 1 else ''}, "
                    f"{prio} requiere{'n' if prio != 1 else ''} atención prioritaria") if total else "Sin anomalías detectadas"
        summary = {"anomalies_total": total, "priority_count": prio, "by_type": by_type, "by_severity": by_sev,
                   "avg_confidence": avg_conf, "headline": headline}
        return {"ranked": rows, "summary": summary, "stage_notes": _note(state, "recommendation", headline)}

    return {"readings": readings, "baseline": baseline, "detection": detection, "correlation": correlation,
            "events": events, "explanation": explanation, "recommendation": recommendation}


# ---------- cache helpers ----------
def _key(kind: str, provider: str, text: str) -> str:
    return hashlib.sha256(f"{kind}|{provider}|{text}".encode()).hexdigest()


def _from_cache(cache: AiCache | None, key: str, model):
    if cache is None:
        return None
    payload = cache.get(key)
    return model.model_validate(payload) if payload else None


def _to_cache(cache: AiCache | None, key: str, provider: str, meter_id: str, obj) -> None:
    if cache is not None:
        cache.set(key, obj.model_dump(mode="json"), provider=provider, meter_id=meter_id)
