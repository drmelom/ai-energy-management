# AI Energy Management Platform

MVP end-to-end para gestionar medidores eléctricos y usar IA para **detectar, explicar, priorizar y recomendar** acciones sobre anomalías. Prueba técnica · desarrollador full stack mid.

**Ciclo completo que demuestra:** datos → análisis → anomalía → explicación → priorización → acción.

| Capa | Stack |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy + SQLite · pandas · LangGraph |
| IA | **Jev** (TypeSafe AI, modelo de decisión) para clasificar · LLM vía OpenRouter para redactar · fallbacks deterministas (reglas y plantillas) |
| Frontend | Vite · React 19 · TypeScript · Tailwind CSS v4 · Recharts 3 · react-router |
| Tests | pytest (36 tests, sin red, < 5 s) |

## Arranque en 3 comandos

Requisitos: [uv](https://docs.astral.sh/uv/) (Python) y [pnpm](https://pnpm.io/) (Node 20+).

```bash
# 1. Backend (crea la BD SQLite y carga los CSV la primera vez)
cd backend && cp .env.example .env && uv sync && uv run uvicorn app.main:app --port 8000
```

```bash
# 2. Frontend (en otra terminal; proxy /api -> :8000)
cd frontend && pnpm install && pnpm dev
```

```bash
# 3. Tests
cd backend && uv run pytest
```

Abrir <http://localhost:5173> · login demo `admin` / `admin` · Swagger en <http://localhost:8000/docs>.

**Sin claves de API el sistema funciona completo** en modo `rules` + `template` (el badge del header lo indica). Para usar los proveedores reales, en `backend/.env`:

```dotenv
OPENROUTER_API_KEY=sk-or-...   # una sola clave: Jev (typesafe/jev-1.13) + LLM (modelos :free) salen de OpenRouter
```

## Flujo de la demo (5–10 min)

1. **Login** → **Dashboard**: 6 KPIs y ranking de flota ordenado por urgencia. M-109 y M-112 en las dos primeras filas.
2. **Medidores** → filtro *Crítico* → **M-109**: consumo horario con baseline y banda ±25 % (el umbral del detector); el salto sale de la banda a las 14:00 del 12/09 con la bandera del evento `UNKNOWN`; abajo, el factor de potencia cae a la zona roja.
3. **Ejecutar análisis IA**: timeline de 7 etapas en vivo (Lecturas → … → Recomendación) con el detalle de cada una y quién decidió/explicó cada caso.
4. **Anomalías IA**: tabla priorizada. M-109 *Anomalía real · Alta*, M-112 *Calidad de dato · Alta*, M-104 *Explicable · Media*, M-106 *Falso positivo · Baja*.
5. **Investigar** M-109: qué encontró la IA, evidencia con cifras, antes/después, distribución de probabilidad de Jev, eventos relacionados y **acción recomendada** → marcar en revisión / resolver.
6. **M-112**: consumo plano dentro de la banda pero tensión en diente de sierra y PF a 0,58 cada 3 h → problema de medida, no de consumo.

## Cómo funciona la IA

```
Lecturas → Baseline → Detección → Correlación → Eventos → Explicación → Recomendación
   └────────── analítica determinista (pandas) ──────────┘   Jev + LLM      ranking
```

- **Etapas 1–5 (deterministas, testeables).** Baseline = mediana por hora del día de los primeros 7 días. Segmento de consumo = ≥ 6 h consecutivas con |desvío| ≥ 25 %. Calidad de dato = tensión fuera de ±5 %, saltos > 10 V y residuo de P ≈ V·I·PF que cambia de signo. Correlación eléctrica (ΔPF, ΔV, ΔI) y cruce con `events.csv` en ±24 h con semántica por tipo (`UNKNOWN` nunca explica nada). Todo se emite como **evidencia verbalizada** con las cifras ya formateadas.
- **Etapa 6 · decisión (Jev).** Jev no genera texto: recibe la evidencia en inglés y responde tres preguntas cerradas en paralelo, devolviendo distribuciones de probabilidad: tipo (`REAL_ANOMALY | EXPLAINABLE_ANOMALY | FALSE_POSITIVE | DATA_QUALITY`), severidad (escala `LOW < MEDIUM < HIGH`) y prioridad (sí/no). La confianza es la calibrada por Jev, no un número inventado. Dos guardrails duros (un tipo "explicado" exige evento explicativo; `DATA_QUALITY` exige señales eléctricas) devuelven el caso a reglas si Jev contradice la evidencia.
- **Etapa 6 · explicación (LLM).** Un modelo vía OpenRouter (array de fallback `models`) redacta `reason` y `recommended_action` en español con salida JSON forzada. Un **validador anti-invención** rechaza cualquier cifra que no esté en la evidencia y cae a plantilla.
- **Fallbacks.** Sin clave, timeout, 5xx o salida inválida → reglas / plantillas. Cada anomalía registra quién la decidió y explicó (`ai_meta`), las notas de fallback y las latencias. La IA puede fallar; el análisis no.
- **Caché de respuestas** por hash de evidencia (`ai_cache`), implementada pero **desactivada por defecto** (`force_refresh: true`) para que cada ejecución llame a los proveedores en vivo y la latencia real sea visible. Con `force_refresh: false` se reutilizan las respuestas y el badge lo marca como *caché*.

Resultado con el dataset entregado (test de regresión, no aspiración): 4 anomalías, 2 prioritarias, M-109 primera, cero falsos positivos en los otros 8 medidores.

## API

`GET /meters` · `GET /meters/{id}` · `GET /meters/{id}/readings?resolution=hourly|daily&include_baseline=true` · `GET /meters/{id}/events` · `GET /events` · `GET /anomalies` · `GET /anomalies/{id}` · `PATCH /anomalies/{id}` · `POST /ai/analyze` · `GET /ai/analysis` · `GET /ai/analysis/{id}` · `GET /dashboard/summary` · `GET /health` · `POST /auth/login`. Contrato completo en [backend/ARCHITECTURE.md §4](backend/ARCHITECTURE.md).

## Estructura

```
backend/app/
  analytics/   baseline, detectores, correlación, evidencia  (pandas puro, sin IO)
  ai/          puertos + adaptadores: jev, rules, openrouter, templates, factory
  pipeline/    LangGraph: estado, 7 nodos, grafo lineal
  services/    AnalysisRunner (asyncio.Task, progreso persistido), meters, anomalies, dashboard
  routers/     HTTP
  models.py · schemas.py · seed.py · db.py · config.py · main.py
backend/tests/ detectores (sintéticos + CSV reales), proveedores, API + pipeline end-to-end
frontend/src/  api/ (cliente tipado) · lib/ (semántica, formato, shaping) · components/ (17) · pages/ (7)
docs/          DATA_ANALYSIS.md (EDA con umbrales validados) · DATA_VIZ.md (spec visual) · enunciado
```

Patrón: **capas simples** (router → service → SQLAlchemy) con **un único puerto explícito** en la frontera de IA (`DecisionProvider`, `ExplanationProvider`). Justificación y alternativas rechazadas en [backend/ARCHITECTURE.md §1](backend/ARCHITECTURE.md).

## Decisiones técnicas

- **Python en lugar de Go (sugerencia del enunciado).** El valor de la prueba está en analítica + IA; pandas, LangGraph y los SDK de Jev/OpenRouter están maduros en Python y el candidato lo domina para defenderlo. La API está desacoplada por contrato y es portable.
- **SQLite.** 4.032 lecturas, un usuario, cero setup para el evaluador. WAL para que el análisis en segundo plano escriba mientras la UI lee. `DATABASE_URL` cambia a Postgres sin tocar código.
- **Reglas transparentes en lugar de ML entrenado.** 14 días y 12 series: un umbral verificable con margen documentado (peor medidor normal a mitad de camino de cada umbral) gana a un modelo que nadie podría explicar. Lo explicable *es* el requisito.
- **Jev para decidir, LLM para redactar.** Un LLM inventa el "0,96 de confianza"; Jev lo calcula. El LLM solo escribe sobre cifras ya calculadas y un validador lo comprueba.
- **Sin caché activa, sin cola externa, sin Alembic, sin JWT real, sin paginación.** Ninguno resuelve un problema que este MVP tenga; tabla completa con "cómo se añadiría" en [backend/ARCHITECTURE.md §11](backend/ARCHITECTURE.md).
- **`expected_results.csv` nunca se usa** ni se referencia: los 4 casos se validan con la evidencia de los datos.

## Límites conocidos

- Umbrales calibrados sobre este dataset sintético (sin ciclo semanal, ruido 3–5 %); en producción se recalibrarían por segmento.
- Un solo worker de uvicorn (el run activo vive en memoria).
- Modelos gratuitos de OpenRouter: 50 peticiones/día sin créditos, latencia 8–12 s; la etapa *Explicación* es la única que tarda.
