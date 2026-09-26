"""LLM explanation adapter via OpenRouter (OpenAI-compatible).

The LLM only writes prose. It receives the decision already made and the
Spanish evidence, and must reuse those figures. A validator rejects any
number that does not appear in the evidence, falling back to templates.
"""
from __future__ import annotations

import asyncio
import re
import time

import httpx
import openai
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.analytics.evidence import Candidate
from app.ai.ports import Decision, Explanation, ProviderError

SYSTEM_PROMPT = (
    "Eres un analista senior de energía de una compañía eléctrica. Recibes la clasificación ya decidida de un caso "
    "y la evidencia numérica calculada por el sistema. Redacta en español: (1) reason: máximo dos frases que expliquen "
    "la clasificación citando al menos una cifra de la evidencia; (2) recommended_action: una frase imperativa, coherente "
    "con el tipo y la severidad. Reglas: usa únicamente las cifras que aparecen en la evidencia, escritas exactamente igual, "
    "nunca inventes ni redondees de otra forma; no contradigas la clasificación; no menciones que eres una IA."
)

ACTION_GUIDE = {
    "REAL_ANOMALY": "investigar la instalación y las cargas conectadas; verificar el medidor en campo",
    "EXPLAINABLE_ANOMALY": "actualizar el baseline del medidor y revisar contrato/potencia; sin intervención en campo",
    "FALSE_POSITIVE": "cerrar sin acción y registrar como evento planificado",
    "DATA_QUALITY": "revisar medidor y comunicaciones; poner las lecturas del periodo en cuarentena antes de facturar",
}


class ExplanationOut(BaseModel):
    reason: str = Field(description="Máximo dos frases, en español, citando al menos una cifra de la evidencia.")
    recommended_action: str = Field(description="Una frase imperativa en español.")


_NUM = re.compile(r"[-+±]?\d[\d.,]*")


def _parse_numbers(text: str, es_only: bool) -> list[set[float]]:
    """One set of readings per numeric token. Evidence is always formatted es-CO (1.234,5) so it gets a single
    reading; the LLM may write es or en style, so its tokens get both readings and must match on at least one."""
    out: list[set[float]] = []
    for tok in _NUM.findall(text):
        tok = tok.strip("+-±").rstrip(".,")
        if not tok:
            continue
        variants = [tok.replace(".", "").replace(",", ".")]  # es-CO reading
        if not es_only:
            variants.append(tok.replace(",", ""))          # en reading
        readings: set[float] = set()
        for v in variants:
            try:
                readings.add(round(float(v), 2))
            except ValueError:
                pass
        if readings:
            out.append(readings)
    return out


def numbers_are_grounded(text: str, evidence_text: str, tol: float = 0.05) -> bool:
    allowed = {n for s in _parse_numbers(evidence_text, es_only=True) for n in s} | {float(h) for h in range(0, 25)}
    for readings in _parse_numbers(text, es_only=False):
        if not any(abs(n - a) <= tol or (a and abs(n / a - 1) <= 0.005) for n in readings for a in allowed):
            return False
    return True


def user_prompt(c: Candidate, d: Decision) -> str:
    events = "\n".join(f"- {e.type} ({rel}) el {e.timestamp:%d/%m %H:%M}: {e.description}" for e, rel in c.events) or "- ninguno"
    return (
        f"Medidor: {c.meter_id}\nClasificación: {d.type}\nSeveridad: {d.severity}\nPrioridad: {'sí' if d.priority else 'no'}\n\n"
        f"Evidencia:\n{c.evidence_text('es')}\n\nEventos registrados:\n{events}\n\n"
        f"Guía de acción para este tipo: {ACTION_GUIDE[d.type]}."
    )


class OpenRouterExplanationProvider:
    name = "llm"

    def __init__(self, api_key: str, base_url: str, models: list[str], timeout: float, max_concurrency: int = 4):
        self._models = models
        self._llm = ChatOpenAI(
            base_url=base_url, api_key=api_key, model=models[0], timeout=timeout, max_retries=0, temperature=0.2,
            extra_body={"models": models, "provider": {"require_parameters": True}},
        ).with_structured_output(ExplanationOut, method="json_schema", include_raw=True)
        self._sem = asyncio.Semaphore(max_concurrency)

    async def explain(self, candidate: Candidate, decision: Decision) -> Explanation:
        t0 = time.perf_counter()
        try:
            async with self._sem:
                res = await self._llm.ainvoke([("system", SYSTEM_PROMPT), ("user", user_prompt(candidate, decision))])
        except (asyncio.TimeoutError, httpx.TimeoutException, httpx.ConnectError, openai.APITimeoutError) as e:
            raise ProviderError("llm:timeout", retryable=True) from e
        except openai.APIConnectionError as e:
            raise ProviderError("llm:connection", retryable=True) from e
        except openai.APIStatusError as e:
            retry = e.status_code == 429 or 500 <= e.status_code < 600
            raise ProviderError(f"llm:http_{e.status_code}", retryable=retry) from e
        except Exception as e:  # noqa: BLE001
            raise ProviderError(f"llm:{type(e).__name__}", retryable=False) from e

        parsed: ExplanationOut | None = res.get("parsed")
        raw = res.get("raw")
        if parsed is None or not parsed.reason.strip() or not parsed.recommended_action.strip():
            raise ProviderError("llm:empty_output", retryable=False)
        if len(parsed.reason) > 400:
            raise ProviderError("llm:too_long", retryable=False)
        if not numbers_are_grounded(parsed.reason + " " + parsed.recommended_action, candidate.evidence_text("es")):
            raise ProviderError("llm:invalid_numbers", retryable=False)

        model = (getattr(raw, "response_metadata", {}) or {}).get("model_name") or self._models[0]
        return Explanation(
            reason=parsed.reason.strip(),
            recommended_action=parsed.recommended_action.strip(),
            provider=f"llm:{model}",
            latency_ms=int((time.perf_counter() - t0) * 1000),
        )
