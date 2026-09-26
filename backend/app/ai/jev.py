"""Jev (TypeSafe AI System One model) decision adapter.

Jev answers closed questions about a text state and returns probability
distributions. It never sees raw numbers from the CSV: the state is the
pre-computed, verbalized English evidence. Default route is OpenRouter's
TypeSafe-compatible endpoint; any TypeSafe-compatible base URL works.
"""
from __future__ import annotations

import time

from langchain_typesafe import Choice, Noul, Score, TypeSafeClassifier
from langchain_typesafe.client import (
    TypeSafeAPIConnectionError,
    TypeSafeAPIError,
    TypeSafeAPITimeoutError,
    TypeSafeInternalServerError,
    TypeSafeRateLimitError,
)

from app.analytics.evidence import Candidate
from app.ai.ports import Decision, ProviderError

SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH"]

QUESTIONS = {
    "type": Choice(
        instructions="What best describes this electricity meter's situation?",
        criteria={
            "REAL_ANOMALY": "Consumption changed significantly and no known operational event explains it.",
            "EXPLAINABLE_ANOMALY": "Consumption changed and a known operational change (new load, new process) explains it; the new level is legitimate.",
            "FALSE_POSITIVE": "The deviation is fully explained by a planned outage or maintenance; nothing to investigate.",
            "DATA_QUALITY": "The readings themselves are unreliable: voltage jumps, values outside the operating band, physically inconsistent power.",
        },
    ),
    "severity": Score(
        instructions="How severe is the operational impact of this situation?",
        criteria=[
            "LOW: nothing to do. A transient, fully explained deviation (e.g. a planned outage) that has already ended.",
            "MEDIUM: needs operational follow-up but no urgent field work: a legitimate but permanent change that requires updating the baseline, contract or capacity, or a case worth validating.",
            "HIGH: requires prompt investigation: an unexplained change, or readings that cannot be trusted.",
        ],
    ),
    "priority": Noul(instructions="Does this case require priority investigation by a field technician?"),
    # 4th question: Jev's own confidence in the whole assessment, asked directly (not derived from the other answers).
    "confidence": Score(
        instructions="How conclusive is the evidence for classifying this meter's situation, its severity and whether it needs priority investigation?",
        criteria=[
            "Inconclusive: key information is missing or contradictory; a human must review.",
            "Partially conclusive: the classification is reasonable but there are gaps or a plausible alternative.",
            "Conclusive: the evidence clearly supports one classification, severity and priority decision.",
        ],
    ),
}
CONFIDENCE_LEVELS = ["INCONCLUSIVE", "PARTIAL", "CONCLUSIVE"]


def to_jev_state(c: Candidate) -> str:
    lines = [
        f"Electricity meter {c.meter_id}. Hourly readings over 14 days; the first 7 days are the trusted baseline.",
        "Findings (all figures pre-computed by the analytics engine):",
    ]
    lines += [f"- {e.text_en}" for e in c.evidence if not e.kind.startswith("EVENT_") and e.kind != "NO_EXPLAINING_EVENT"]
    absent = []
    if not c.dq_signals.get("voltage_out_of_band"):
        absent.append("voltage stayed within the ±5% band")
    if not c.dq_signals.get("voltage_jumps"):
        absent.append("no voltage jumps between hours")
    if not c.dq_signals.get("residual_erratic"):
        absent.append("the power relationship P ≈ V·I·PF is stable (not erratic)")
    if absent:
        lines.append("- " + "; ".join(absent).capitalize() + ".")
    ev_lines = [e.text_en for e in c.evidence if e.kind.startswith("EVENT_")]
    lines.append("Known events for this meter:" if ev_lines else "Known events for this meter: none.")
    lines += [f"- {t}" for t in ev_lines]
    if c.segment is not None and c.explaining_event is None:
        lines.append("No operational change, outage or maintenance explains the deviation.")
    return "\n".join(lines)


class JevDecisionProvider:
    name = "jev"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float):
        self._clf = TypeSafeClassifier(api_key=api_key, base_url=base_url, model=model, timeout=timeout)

    async def decide(self, candidate: Candidate) -> Decision:
        t0 = time.perf_counter()
        try:
            r = await self._clf.ainvoke({"state": to_jev_state(candidate), "questions": QUESTIONS})
        except (TypeSafeAPITimeoutError, TypeSafeAPIConnectionError) as e:
            raise ProviderError("jev:timeout", retryable=True) from e
        except (TypeSafeInternalServerError, TypeSafeRateLimitError) as e:
            raise ProviderError("jev:http_5xx", retryable=True) from e
        except TypeSafeAPIError as e:
            raise ProviderError("jev:auth", retryable=False) from e
        except Exception as e:  # noqa: BLE001 - any other failure degrades to rules
            raise ProviderError(f"jev:{type(e).__name__}", retryable=False) from e

        t = r.answers["type"]
        s = r.answers["severity"]
        p = r.answers["priority"]
        cf = r.answers["confidence"]
        sev_idx = min(2, max(0, round(s.score)))
        severity = SEVERITY_LEVELS[sev_idx]
        priority = p.noul >= 0.5
        # Confidence = Jev's direct answer to the 4th question: position on the 0..2 conclusiveness scale, mapped to 0..1.
        return Decision(
            type=t.choice,
            severity=severity,
            priority=priority,
            confidence=round(min(1.0, max(0.0, float(cf.score) / 2)), 2),
            confidence_probabilities={CONFIDENCE_LEVELS[int(k)]: round(v, 3) for k, v in cf.probabilities.items() if int(k) < 3},
            type_probabilities={k: round(v, 3) for k, v in t.probabilities.items()},
            severity_probabilities={SEVERITY_LEVELS[int(k)]: round(v, 3) for k, v in s.probabilities.items() if int(k) < 3},
            priority_probability=round(p.noul, 3),
            provider="jev",
            latency_ms=int((time.perf_counter() - t0) * 1000),
        )
