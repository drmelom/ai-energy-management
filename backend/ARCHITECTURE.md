# Backend — Arquitectura

**Proyecto:** ai-energy-management · **Carpeta:** `backend/`
**Stack (fijado):** Python 3.12 · FastAPI · SQLite · SQLAlchemy 2.0 · pandas · LangGraph · Jev (`langchain-typesafe`) · OpenRouter (`langchain-openai`) · pytest · `uv`

Este documento es la referencia de implementación y el guion de defensa en entrevista. Cada decisión lleva su "por qué" en una o dos frases; si una sección no se puede explicar en 30 segundos, está mal escrita.

---

## 0. Resumen ejecutivo (para abrir la entrevista)

- **Patrón:** arquitectura en capas (`router → service → repositorio implícito vía SQLAlchemy`) con **un único puerto explícito: la frontera de IA** (`DecisionProvider`, `ExplanationProvider`). Nada más se abstrae.
- **Analítica determinista primero, IA después.** Las etapas 1–5 son pandas puro y reproducible; la IA (Jev + LLM) solo decide y redacta sobre evidencia ya calculada y verbalizada. Sin claves de API el sistema funciona completo con fallbacks basados en reglas y plantillas, y cada anomalía registra quién la decidió (`jev` o `rules`) y quién la explicó (`llm:<modelo>` o `template`).
- **Análisis asíncrono y pollable:** `POST /ai/analyze` devuelve un `analysis_id`; `GET /ai/analysis/{id}` expone las 7 etapas con estado. El grafo LangGraph se ejecuta como `asyncio.Task` en el mismo proceso; el progreso se persiste tras cada nodo.
- **Resultado esperado con los datos entregados:** 4 anomalías — M-109 `REAL_ANOMALY/HIGH` (primera), M-112 `DATA_QUALITY/HIGH`, M-104 `EXPLAINABLE_ANOMALY/MEDIUM`, M-106 `FALSE_POSITIVE/LOW` — y cero anomalías en los otros 8 medidores. Es un test de regresión, no una aspiración.

---

## 1. Patrón arquitectónico

### Decisión: **capas simples + un puerto para la IA**

| Opción | Veredicto | Razón |
|---|---|---|
| Layered (router → service → DB) | **Elegida como base** | Un dominio pequeño (5 tablas, 12 endpoints) con un solo flujo de escritura relevante (la ejecución del análisis). Cualquier entrevistador la reconoce al instante. |
| Hexagonal completo | Rechazada | Puertos para la base de datos, para el reloj, para el CSV... son interfaces con una sola implementación. Es coste sin variabilidad real. |
| Ports & adapters **solo en la frontera de IA** | **Elegida como complemento** | Aquí sí hay variabilidad real y obligatoria: Jev *o* reglas; LLM *o* plantillas. Dos `Protocol` de Python resuelven el swap y hacen la app testeable sin red. |
| Vertical slice por feature | Rechazada | Meters, anomalies, dashboard y analysis leen las mismas tablas y comparten la misma función de baseline. Cortar en vertical duplicaría la analítica o crearía un módulo "shared" que sería la capa de servicios con otro nombre. |

### Explícitamente fuera

CQRS, event sourcing, contenedor de DI (FastAPI `Depends` basta), microservicios, cola externa, Alembic, capa de caché, ORM async. Ninguno resuelve un problema que este MVP tenga; todos añaden superficie que habría que defender.

### Regla de dependencias (la única que hay que memorizar)

```
routers  →  services  →  models / db
               ↓
        pipeline (LangGraph)  →  analytics (pandas puro, sin IO)
               ↓
        ai (puertos + adaptadores)
```

- `analytics/` no importa nada de SQLAlchemy ni de FastAPI: recibe DataFrames, devuelve dataclasses. Es lo que se unit-testea con series sintéticas.
- `ai/` no conoce la base de datos: recibe `Evidence`, devuelve `Decision` / `Explanation`.
- `pipeline/` es el único sitio que conecta analítica e IA; `services/analysis.py` es el único que conecta pipeline y persistencia.

---

## 2. Árbol de `backend/`

```
backend/
├── pyproject.toml              # deps + [tool.pytest] + scripts (uv run dev / uv run test)
├── .env.example                # variables documentadas (sección 8)
├── ARCHITECTURE.md             # este documento
├── data/
│   ├── readings.csv            # 4.032 lecturas horarias (seed)
│   └── events.csv              # 4 eventos operativos (seed)
├── app/
│   ├── main.py                 # create_app(): lifespan (create_all + seed), CORS, request-id middleware, routers, exception handlers
│   ├── config.py               # Settings (pydantic-settings) + get_settings()
│   ├── db.py                   # engine SQLite, SessionLocal, Base, get_db() dependency
│   ├── models.py               # 5 tablas SQLAlchemy: Meter, Reading, Event, AnalysisRun, Anomaly
│   ├── schemas.py              # Pydantic de entrada/salida = contrato API (sección 4)
│   ├── errors.py               # AppError(code, status, message) + handlers → JSON de error uniforme
│   ├── seed.py                 # CSV → tablas si la BD está vacía; idempotente
│   ├── routers/
│   │   ├── auth.py             # POST /auth/login (credencial demo)
│   │   ├── meters.py           # GET /meters, /meters/{id}, /meters/{id}/readings, /meters/{id}/events
│   │   ├── events.py           # GET /events
│   │   ├── anomalies.py        # GET /anomalies, GET/PATCH /anomalies/{id}
│   │   ├── analysis.py         # POST /ai/analyze, GET /ai/analysis, GET /ai/analysis/{id}
│   │   └── dashboard.py        # GET /dashboard/summary, GET /health
│   ├── services/
│   │   ├── meters.py           # listado con filtros/orden, detalle, lecturas con resolución + baseline en lectura
│   │   ├── anomalies.py        # consulta por run, detalle con evidencia, cambio de estado
│   │   ├── dashboard.py        # agregados del resumen
│   │   └── analysis.py         # AnalysisRunner: idempotencia, asyncio.Task, persistencia de progreso y resultados
│   ├── analytics/              # pandas puro; sin IO, sin IA
│   │   ├── baseline.py         # perfil horario por medidor (mediana/σ por hora, días 1–7)
│   │   ├── detectors.py        # segmentos de consumo + señales de calidad de dato; umbrales en dataclass Thresholds
│   │   ├── correlation.py      # contexto eléctrico del segmento (ΔV, ΔPF, ΔI) y matching de eventos
│   │   └── evidence.py         # Evidence / Candidate (pydantic) + verbalize(evidence, lang)
│   ├── pipeline/
│   │   ├── state.py            # PipelineState (TypedDict)
│   │   ├── nodes.py            # 7 funciones-nodo, una por etapa
│   │   └── graph.py            # build_graph(): StateGraph lineal de 7 nodos
│   └── ai/
│       ├── ports.py            # Protocols DecisionProvider / ExplanationProvider + Decision / Explanation
│       ├── jev.py              # adaptador TypeSafeClassifier (Choice + Score + Noul)
│       ├── rules.py            # decisor por reglas (fallback y guardrail)
│       ├── openrouter.py       # adaptador ChatOpenAI → OpenRouter, structured output, validador de cifras
│       ├── templates.py        # explicaciones en español por tipo (fallback)
│       └── factory.py          # build_providers(settings) → encadena adaptador real + fallback
└── tests/
    ├── conftest.py             # app de test con SQLite temporal + seed real, providers fake, series sintéticas
    ├── test_detectors.py       # unit: baseline, segmentos, señales DQ sobre series sintéticas
    ├── test_correlation.py     # unit: ventana de eventos, tipos que explican / no explican
    ├── test_rules.py           # unit: clasificador por reglas y tabla de confianza
    ├── test_pipeline_ground_truth.py  # integración: CSV reales → exactamente los 4 casos, 0 en los otros 8, M-109 primero
    ├── test_providers.py       # adaptador Jev con cliente stub; validador anti-cifras-inventadas del LLM; fallbacks
    └── test_api.py             # TestClient: contrato de cada endpoint, errores, idempotencia de /ai/analyze
```

30 ficheros. Explicación en 30 segundos: *routers reciben HTTP, services hablan con la BD, analytics es matemática pura, pipeline la orquesta, ai habla con el exterior y siempre tiene plan B.*

---

## 3. Modelo de dominio

### 3.1 Tablas

```sql
CREATE TABLE meters (
  id          INTEGER PRIMARY KEY,
  meter_id    TEXT NOT NULL UNIQUE,            -- 'M-101'
  name        TEXT NOT NULL,                   -- 'Medidor M-101'
  location    TEXT,                            -- placeholder sintético en seed ('Zona 1'); el CSV no lo trae
  status      TEXT NOT NULL DEFAULT 'UNKNOWN', -- UNKNOWN | NORMAL | WARNING | CRITICAL (derivado del último run)
  created_at  TEXT NOT NULL
);

CREATE TABLE readings (
  id              INTEGER PRIMARY KEY,
  meter_id        TEXT NOT NULL REFERENCES meters(meter_id),
  timestamp       TEXT NOT NULL,               -- ISO-8601 sin tz (los datos no la traen)
  consumption_kwh REAL NOT NULL,
  voltage_v       REAL NOT NULL,
  current_a       REAL NOT NULL,
  power_factor    REAL NOT NULL,
  status          TEXT NOT NULL                -- 'OK' en todo el dataset; se conserva, no se usa
);
CREATE UNIQUE INDEX ix_readings_meter_ts ON readings(meter_id, timestamp);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  meter_id    TEXT NOT NULL REFERENCES meters(meter_id),
  timestamp   TEXT NOT NULL,
  type        TEXT NOT NULL,                   -- OPERATIONAL_CHANGE | SCHEDULED_OUTAGE | UNKNOWN | DATA_QUALITY
  description TEXT NOT NULL
);
CREATE INDEX ix_events_meter_ts ON events(meter_id, timestamp);

CREATE TABLE analysis_runs (
  id             TEXT PRIMARY KEY,             -- uuid4
  status         TEXT NOT NULL,                -- QUEUED | RUNNING | COMPLETED | FAILED
  current_stage  TEXT,                         -- key de la etapa en curso
  stages         TEXT NOT NULL,                -- JSON: lista de 7 StageProgress
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  summary        TEXT,                         -- JSON: RunSummary (al completar)
  error          TEXT,                         -- JSON: {code, message} (al fallar)
  providers      TEXT NOT NULL                 -- JSON: {"decision":"jev|rules","explanation":"llm|template"} configurado al arrancar
);
CREATE INDEX ix_runs_started ON analysis_runs(started_at DESC);

CREATE TABLE anomalies (
  id                 INTEGER PRIMARY KEY,
  analysis_run_id    TEXT NOT NULL REFERENCES analysis_runs(id),
  meter_id           TEXT NOT NULL REFERENCES meters(meter_id),
  detected_at        TEXT NOT NULL,            -- inicio del segmento / primera señal DQ
  window_from        TEXT NOT NULL,
  window_to          TEXT NOT NULL,
  type               TEXT NOT NULL,            -- REAL_ANOMALY | EXPLAINABLE_ANOMALY | FALSE_POSITIVE | DATA_QUALITY
  severity           TEXT NOT NULL,            -- LOW | MEDIUM | HIGH
  confidence         REAL NOT NULL,            -- 0..1
  priority           INTEGER NOT NULL,         -- 0/1: requiere investigación prioritaria
  rank               INTEGER NOT NULL,         -- 1 = más urgente dentro del run
  reason             TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | ACKNOWLEDGED | RESOLVED (paso "Action")
  evidence           TEXT NOT NULL,            -- JSON: list[Evidence]
  events_matched     TEXT NOT NULL,            -- JSON: list[EventRef]
  ai_meta            TEXT NOT NULL,            -- JSON: AiMeta (proveedores, probabilidades, notas de fallback)
  created_at         TEXT NOT NULL
);
CREATE INDEX ix_anomalies_run  ON anomalies(analysis_run_id, rank);
CREATE INDEX ix_anomalies_meter ON anomalies(meter_id);
```

Relaciones: `Meter 1—N Reading`, `Meter 1—N Event`, `AnalysisRun 1—N Anomaly`, `Meter 1—N Anomaly`. Sin borrado en cascada: nada se borra.

### 3.2 Decisiones de datos

| Tema | Decisión | Por qué |
|---|---|---|
| Carga de CSV | `seed.py` en el `lifespan`: si `count(readings)==0` carga `data/*.csv` con pandas → `to_sql`. Valida columnas, 12 medidores, 336 horas contiguas por medidor, sin nulos; falla el arranque con mensaje claro si no. | Cero pasos manuales para el evaluador. |
| Baseline y métricas derivadas | **Se calculan en lectura**, no se persisten. La misma función `analytics.baseline.hourly_profile()` sirve al pipeline y a `GET /meters/{id}/readings?include_baseline=true`. | 4.032 filas: el cálculo cuesta milisegundos. Una tabla de baseline sería una copia que puede desincronizarse. `# ponytail: recomputar en lectura; cachear por run si el dataset crece >100k filas`. |
| Estado del medidor | Campo persistido `meters.status`, recalculado al final de cada run (CRITICAL si su anomalía es HIGH, WARNING si MEDIUM o EXPLAINABLE, NORMAL si nada o FALSE_POSITIVE). | Hace filtrable el listado con un `WHERE` simple; es el único derivado que se persiste porque el filtro lo pide. |
| Anomalías por run | **Versionadas**: cada run inserta sus filas con `analysis_run_id`. `GET /anomalies` sin `run_id` devuelve las del último run `COMPLETED`. | Historial gratis, sin borrados, y el dashboard puede comparar "último run vs anterior" si hiciera falta. |
| Carry-over de estado | Al insertar, si en el run anterior existía anomalía del mismo `(meter_id, type)`, se copia su `status` (ACKNOWLEDGED/RESOLVED). | Evita que re-analizar "reabra" lo que el operador ya gestionó. Una query, cinco líneas. |
| Timestamps | Texto ISO-8601 naive, como el CSV. | SQLite no tiene tipo fecha; el dataset no trae zona horaria y no la vamos a inventar. |

### 3.3 Objetos JSON embebidos

```python
class StageProgress(BaseModel):
    key: Literal["readings","baseline","detection","correlation","events","explanation","recommendation"]
    label: str                       # "Lecturas", "Baseline", ...
    status: Literal["pending","running","done","failed"]
    started_at: datetime | None
    finished_at: datetime | None
    detail: str | None               # "4.032 lecturas · 12 medidores · 14 días"

class RunSummary(BaseModel):
    anomalies_total: int
    priority_count: int
    by_type: dict[str, int]
    by_severity: dict[str, int]
    avg_confidence: float
    headline: str                    # "4 anomalías detectadas, 2 requieren atención prioritaria"

class AiMeta(BaseModel):
    decision_provider: Literal["jev","rules"]
    decision_probabilities: dict[str, float] | None   # distribución de Jev sobre los 4 tipos
    severity_probabilities: dict[str, float] | None
    priority_probability: float | None
    explanation_provider: str        # "llm:nvidia/nemotron-3-super-120b-a12b:free" | "template"
    fallback_notes: list[str]        # ["jev:no_api_key", "llm:timeout", "guardrail:G1"]
    latency_ms: dict[str, int]       # {"decision": 840, "explanation": 3120}
```

---

## 4. Contrato API

Prefijo: sin versión en la ruta (`/api/v1` sería teatro para un MVP con un solo cliente). CORS: `CORS_ORIGINS`. Todas las respuestas JSON `snake_case`. Sin paginación: el dataset está acotado (12 medidores, 336 lecturas/medidor); se documenta como límite conocido.

### 4.1 Auth (demo)

| | |
|---|---|
| `POST /auth/login` | Body `{username, password}` → `200 {token:"demo-token", user:{name:"Operador demo"}}` · `401 INVALID_CREDENTIALS`. |

El token es estático y **no se verifica** en el resto de endpoints (ver sección 11).

### 4.2 Meters

**`GET /meters`**

| Query | Tipo | Notas |
|---|---|---|
| `status` | `UNKNOWN\|NORMAL\|WARNING\|CRITICAL` | filtro exacto |
| `search` | str | `meter_id ILIKE %search%` o `name` |
| `sort` | `consumption\|variation\|severity\|meter_id` (default `meter_id`) | `severity` ordena por severidad de la anomalía del último run (HIGH>MEDIUM>LOW>none) |
| `order` | `asc\|desc` (default `asc`; para `severity` default `desc`) | |

```json
200 {
  "items": [{
    "meter_id": "M-109", "name": "Medidor M-109", "location": "Zona 9", "status": "CRITICAL",
    "total_consumption_kwh": 17370.4,
    "avg_daily_kwh": 1240.7,
    "variation_pct": 68.9,            // media de desviación vs baseline en el periodo de evaluación (días 8–14)
    "last_reading_at": "2026-09-14T23:00:00",
    "anomaly": { "id": 3, "type": "REAL_ANOMALY", "severity": "HIGH", "priority": true } | null
  }],
  "total": 12,
  "analysis_run_id": "…" | null       // run del que salen status/anomaly
}
```

**`GET /meters/{meter_id}`** → `200 MeterDetail` · `404 METER_NOT_FOUND`

```json
{
  "meter_id": "M-109", "name": "…", "location": "…", "status": "CRITICAL", "created_at": "…",
  "period": { "from": "2026-09-01T00:00:00", "to": "2026-09-14T23:00:00", "readings": 336 },
  "stats": { "total_kwh": 17370.4, "avg_daily_kwh": 1240.7, "avg_voltage_v": 219.2, "min_voltage_v": 213.4,
             "max_voltage_v": 223.6, "avg_power_factor": 0.905, "min_power_factor": 0.708 },
  "baseline": { "days": 7, "from": "2026-09-01", "to": "2026-09-07",
                "hourly": [ { "hour": 0, "kwh": 31.7, "kwh_std": 1.1, "voltage_v": 220.1, "power_factor": 0.94 }, … ] },
  "variation_pct": 68.9,
  "anomalies": [ { "id": 3, "type": "REAL_ANOMALY", "severity": "HIGH", "status": "OPEN", "detected_at": "…" } ],
  "events_count": 1
}
```

**`GET /meters/{meter_id}/readings`**

| Query | Default | Notas |
|---|---|---|
| `from`, `to` | todo el periodo | ISO-8601; `400 INVALID_RANGE` si `from > to` |
| `resolution` | `hourly` | `hourly\|daily`; daily = suma kWh, media V/I/PF |
| `include_baseline` | `false` | añade `baseline_kwh` y `deviation_pct` por punto (en daily: suma del perfil × 24) |

```json
200 { "meter_id": "M-109", "resolution": "hourly", "from": "…", "to": "…",
      "points": [ { "timestamp": "2026-09-12T14:00:00", "consumption_kwh": 110.35, "voltage_v": 218.24,
                    "current_a": 320.1, "power_factor": 0.74, "baseline_kwh": 51.31, "deviation_pct": 115.1 } ] }
```

**`GET /meters/{meter_id}/events`** → `200 { "items": [Event] }` · **`GET /events?meter_id=&type=`** → igual, global. Necesarios para la pantalla Investigation (línea de tiempo de eventos sobre el gráfico).

```json
Event = { "id": 3, "meter_id": "M-109", "timestamp": "2026-09-12T14:00:00", "type": "UNKNOWN",
          "description": "No operational event reported" }
```

### 4.3 Anomalies

**`GET /anomalies`**

| Query | Notas |
|---|---|
| `run_id` | default: último run COMPLETED. `404 RUN_NOT_FOUND` si no existe |
| `severity`, `type`, `status`, `meter_id` | filtros exactos, combinables |
| `priority` | `true` → solo prioritarias |
| `sort` | `priority` (default: `rank asc`) \| `confidence` \| `detected_at` |

```json
200 { "run_id": "…", "run_finished_at": "…", "items": [ AnomalySummary ], "total": 4 }

AnomalySummary = {
  "id": 3, "rank": 1, "meter_id": "M-109", "meter_name": "Medidor M-109",
  "detected_at": "2026-09-12T14:00:00", "type": "REAL_ANOMALY", "severity": "HIGH",
  "confidence": 0.96, "priority": true, "status": "OPEN",
  "reason": "Consumo 110,3 % por encima del baseline durante 58 h sin evento operativo conocido; el factor de potencia cae de 0,94 a 0,73.",
  "recommended_action": "Investigar el medidor y la instalación: verificar nueva carga no declarada y calidad del factor de potencia.",
  "providers": { "decision": "jev", "explanation": "llm:nvidia/nemotron-3-super-120b-a12b:free" }
}
```

**`GET /anomalies/{id}`** → `200 AnomalyDetail` · `404 ANOMALY_NOT_FOUND`

```json
AnomalyDetail = AnomalySummary + {
  "window": { "from": "2026-09-12T14:00:00", "to": "2026-09-14T23:00:00", "hours": 58 },
  "evidence": [ Evidence ],                 // sección 6.6
  "events_matched": [ { "event_id": 3, "type": "UNKNOWN", "timestamp": "…", "description": "…",
                        "relation": "reported_no_explanation" } ],
  "ai_meta": AiMeta,
  "analysis_run_id": "…"
}
```

**`PATCH /anomalies/{id}`** Body `{ "status": "ACKNOWLEDGED" | "RESOLVED" | "OPEN" }` → `200 AnomalySummary` · `422` si valor inválido. Es el paso "Action" del flujo.

### 4.4 AI analysis

**`POST /ai/analyze`** (sin body)

| Caso | Respuesta |
|---|---|
| No hay run activo | `202 { "analysis_id": "…", "status": "QUEUED", "reused": false }` |
| Ya hay run `QUEUED`/`RUNNING` | `202 { "analysis_id": "<el activo>", "status": "RUNNING", "reused": true }` |

Idempotente ante doble clic: nunca hay dos runs simultáneos (sección 5.5).

**`GET /ai/analysis/{id}`** → `200 AnalysisRun` · `404 RUN_NOT_FOUND`

```json
{
  "id": "…", "status": "RUNNING", "current_stage": "explanation",
  "started_at": "…", "finished_at": null,
  "stages": [
    { "key": "readings",       "label": "Lecturas",      "status": "done",    "detail": "4.032 lecturas · 12 medidores · 14 días", "started_at": "…", "finished_at": "…" },
    { "key": "baseline",       "label": "Baseline",      "status": "done",    "detail": "Perfil horario de 7 días para 12 medidores" },
    { "key": "detection",      "label": "Detección",     "status": "done",    "detail": "3 segmentos de consumo · 1 medidor con señales de calidad de dato" },
    { "key": "correlation",    "label": "Correlación",   "status": "done",    "detail": "Contexto eléctrico calculado para 4 candidatos" },
    { "key": "events",         "label": "Eventos",       "status": "done",    "detail": "2 eventos explican · 1 reportado sin explicación · 1 de calidad de dato" },
    { "key": "explanation",    "label": "Explicación",   "status": "running", "detail": null },
    { "key": "recommendation", "label": "Recomendación", "status": "pending", "detail": null }
  ],
  "providers": { "decision": "jev", "explanation": "llm" },
  "summary": null,            // RunSummary al completar
  "error": null               // {code, message} al fallar
}
```

**`GET /ai/analysis?limit=5`** → `200 { "items": [AnalysisRun sin stages] }`, más reciente primero. El frontend lo usa al cargar para saber si hay un run en curso y retomar el polling.

Polling recomendado: cada 700 ms mientras `status ∈ {QUEUED, RUNNING}`.

### 4.5 Dashboard y salud

**`GET /dashboard/summary`**

```json
200 {
  "meters": { "total": 12, "by_status": { "NORMAL": 8, "WARNING": 1, "CRITICAL": 2, "UNKNOWN": 0 } },
  "consumption": { "total_kwh": 145203.8, "period_from": "2026-09-01", "period_to": "2026-09-14", "avg_daily_kwh": 10371.7 },
  "anomalies": { "total": 4, "priority": 2, "by_severity": { "HIGH": 2, "MEDIUM": 1, "LOW": 1 },
                 "by_type": { "REAL_ANOMALY": 1, "DATA_QUALITY": 1, "EXPLAINABLE_ANOMALY": 1, "FALSE_POSITIVE": 1 },
                 "avg_confidence": 0.91, "open": 4 },
  "last_analysis": { "id": "…", "status": "COMPLETED", "current_stage": null, "started_at": "…", "finished_at": "…",
                     "headline": "4 anomalías detectadas, 2 requieren atención prioritaria" } | null,
  "ai_mode": { "decision": "jev" | "rules", "explanation": "llm" | "template" }
}
```

**`GET /health`** → `200 { "status": "ok", "db": "ok", "readings": 4032, "providers": { "decision": "rules", "explanation": "template" } }`. Permite al frontend mostrar el badge "modo offline / sin claves".

### 4.6 Códigos de estado

`200` lectura · `202` análisis aceptado · `400` rango/parámetro semánticamente inválido · `401` login · `404` recurso · `409` reservado (no se usa: el doble clic devuelve 202 reused) · `422` validación Pydantic · `500` error no controlado · `503` BD no disponible. Formato de error en sección 10.

---

## 5. Diseño del pipeline (LangGraph)

### 5.1 Estado

```python
class PipelineState(TypedDict, total=False):
    run_id: str
    # etapa 1
    readings: pd.DataFrame            # columnas del CSV + day (1..14) + hour (0..23)
    events: list[EventRecord]         # dataclass: id, meter_id, timestamp, type, description
    data_summary: DataSummary         # meters, rows, from, to, missing_hours
    # etapa 2
    baselines: dict[str, BaselineProfile]   # meter_id → 24 filas (kwh_median, kwh_std, v_mean, pf_mean, i_mean)
    # etapa 3
    candidates: list[Candidate]       # un Candidate por medidor con hallazgos (segmento y/o señales DQ)
    # etapa 4 y 5 enriquecen candidates in place (evidencia eléctrica, eventos)
    # etapa 6
    decisions: dict[str, Decision]    # meter_id → Decision (type, severity, priority, confidence, probs, provider)
    explanations: dict[str, Explanation]    # meter_id → (reason, recommended_action, provider)
    # etapa 7
    ranked: list[AnomalyDraft]        # listo para persistir, con rank
    summary: RunSummary
    # transversal
    stage_notes: dict[str, str]       # key etapa → detail legible ("4.032 lecturas · …")
```

Los DataFrames viven en el estado sin problema porque **no hay checkpointer**: el grafo es efímero y el progreso se persiste fuera (5.3). Sin checkpointer no hay serialización y no hay que pelear con pandas.

### 5.2 Nodos

Grafo lineal `readings → baseline → detection → correlation → events → explanation → recommendation → END`. Una etapa de UI = un nodo; las etiquetas de `StageProgress` son exactamente las 7 del enunciado.

| # | Nodo (key) | Entrada | Salida | Naturaleza |
|---|---|---|---|---|
| 1 | `readings` | `run_id` | `readings`, `events`, `data_summary` | DB → pandas. Valida continuidad horaria. Falla el run si faltan columnas o medidores. |
| 2 | `baseline` | `readings` | `baselines` | Perfil horario días 1–7 (6.1). |
| 3 | `detection` | `readings`, `baselines` | `candidates` | Segmentos de consumo (6.2) + señales DQ (6.3). Emite `Evidence`. |
| 4 | `correlation` | `readings`, `baselines`, `candidates` | `candidates` enriquecidos | Contexto eléctrico del segmento: ΔV, ΔPF, ΔI vs baseline (6.4). |
| 5 | `events` | `events`, `candidates` | `candidates` enriquecidos | Matching temporal + semántico de eventos (6.5). |
| 6 | `explanation` | `candidates` | `decisions`, `explanations` | **Única etapa con IA.** `DecisionProvider` (Jev/reglas) y después `ExplanationProvider` (LLM/plantilla), en paralelo por candidato con `asyncio.gather` y semáforo de 4. |
| 7 | `recommendation` | `decisions`, `explanations`, `candidates` | `ranked`, `summary` | Determinista: ordena por prioridad, calcula el titular, construye los `AnomalyDraft`. |

¿Por qué la decisión de Jev no es una etapa aparte? Porque el enunciado fija 7 etapas con nombre y "Explicación" es donde el sistema *entiende* el caso (qué es, cuán grave, por qué); "Recomendación" es la salida accionable: lista priorizada + titular. Se defiende en una frase: *el sistema explica en la 6 y recomienda en la 7.*

Los nodos 1–5 y 7 son funciones síncronas puras (pandas); el 6 es `async`. LangGraph ejecuta los síncronos en su executor bajo `ainvoke`/`astream`, así el event loop de FastAPI no se bloquea.

### 5.3 Persistencia del progreso

Los nodos **no tocan la BD** (salvo el 1, que lee). El `AnalysisRunner` consume `graph.astream(state, stream_mode="updates")`: cada elemento del stream lleva la key del nodo que acaba de terminar. En ese momento el runner:

1. marca esa etapa `done` con `finished_at` y `detail = state.stage_notes[key]`,
2. marca la siguiente `running` con `started_at` y actualiza `current_stage`,
3. hace `UPDATE analysis_runs SET stages=?, current_stage=?`.

Siete updates por run, cero acoplamiento entre nodos y persistencia, y el frontend ve el avance con una latencia máxima de un intervalo de polling.

### 5.4 Ejecución en background

**Decisión: `asyncio.create_task` gestionado por `AnalysisRunner` (singleton en `app.state`), no `BackgroundTasks`.**

- Necesitamos **un handle** de la tarea para la idempotencia (¿hay un run vivo?) y para aplicar un timeout global (`asyncio.wait_for`, 120 s). `BackgroundTasks` no devuelve handle y está ligado al ciclo de vida de la request.
- El nodo 6 es I/O async (HTTP a Jev/OpenRouter); una tarea en el loop es su hábitat natural.
- Restricción asumida: **un solo worker** de uvicorn. Documentado en el README de arranque. `# ponytail: estado de run en memoria + 1 worker; si hubiera varios workers, el lock pasaría a una fila en analysis_runs con status RUNNING y la ejecución a un proceso aparte.`

Al arrancar la app, cualquier run que quedara en `QUEUED/RUNNING` (proceso muerto) se marca `FAILED` con `error.code = "INTERRUPTED"`.

### 5.5 Idempotencia

`AnalysisRunner.start()` hace, bajo un `asyncio.Lock`:

```
if self.active_task and not self.active_task.done(): return (active_run_id, reused=True)
run = insert AnalysisRun(status=QUEUED, stages=7×pending, providers=configured)
self.active_task = asyncio.create_task(self._execute(run.id))
return (run.id, reused=False)
```

Doble clic → misma respuesta, mismo id, el frontend simplemente sigue pollando. Sin 409 porque no es un error del usuario.

### 5.6 Persistencia final y fallo

Al terminar el nodo 7, en **una transacción**: insertar N `anomalies` (con carry-over de `status`), actualizar `meters.status` de los 12 medidores, `analysis_runs.status=COMPLETED`, `summary`, `finished_at`. Si cualquier nodo 1–5 o 7 lanza excepción: `status=FAILED`, `error={code, message}`, etapa en curso `failed`, y las anomalías del run anterior siguen siendo "las vigentes". **El nodo 6 nunca falla el run**: los fallos de proveedores degradan a fallback (sección 7).

---

## 6. Especificación analítica

Todos los umbrales viven en `analytics/detectors.py::Thresholds` (dataclass con defaults; los tests pueden instanciar otros). No son variables de entorno: no cambian entre despliegues. Cifras verificadas sobre `data/readings.csv`.

### 6.1 Baseline

- **Ventana:** primeros 7 días del dataset (`2026-09-01` → `2026-09-07`, 168 h por medidor). Los 4 eventos están en días ≥ 8, así que la ventana es limpia; si no lo fuera, la mediana la protege de 1–3 horas atípicas.
- **Perfil horario por medidor:** para cada `hour ∈ 0..23`: `kwh_median`, `kwh_std`, `v_mean`, `pf_mean`, `i_mean` sobre los 7 valores de esa hora.
- **Periodo de evaluación:** días 8–14 (168 h). Toda detección se hace sobre él contra el perfil.
- Desviación horaria: `dev(t) = (kwh(t) − kwh_median[hour(t)]) / kwh_median[hour(t)]`.

Por qué perfil horario y no media diaria: el consumo tiene forma (valle nocturno 32 kWh, pico diurno 52 kWh en M-109); una media plana marcaría el pico como anomalía cada día.

### 6.2 Detector de consumo → segmentos

Un **segmento** es una racha de horas consecutivas con `|dev(t)| ≥ 0.25` de longitud `≥ 6 h`. Se agrupan rachas separadas por ≤ 2 h de hueco. Por medidor se conserva el segmento de mayor `|dev medio|` (con estos datos hay como mucho uno).

Resultados sobre el dataset (margen: los 8 medidores normales tienen `max |dev| = 0.20` horario y `±3 %` diario):

| Medidor | Segmento | Horas | dev medio | Dirección |
|---|---|---|---|---|
| M-104 | 2026-09-11 00:00 → 09-14 23:00 | 96 | **+46,4 %** | subida sostenida (nuevo nivel) |
| M-106 | 2026-09-08 00:00 → 09-08 11:00 | 12 | **−79,9 %** | caída puntual (el día cierra en 852 kWh vs ≈1.350) |
| M-109 | 2026-09-12 14:00 → 09-14 23:00 | 58 | **+110,3 %** | subida escalonada (día 12: +47 %, días 13–14: +110 %) |
| otros 9 | — | — | — | ninguno (M-112 incluido: su consumo es normal) |

Por qué `%` y no z-score horario: con 7 muestras por hora la σ es minúscula y los normales llegan a `z = 8,8` (M-107); el z-score se guarda solo como evidencia informativa.

### 6.3 Detector de calidad de dato → señales

Evaluadas en el periodo de evaluación, por medidor. Tensión nominal **220 V** (media observada 219–220 V; 230 V sería una suposición equivocada).

| Señal | Regla | M-112 | M-109 | Normales |
|---|---|---|---|---|
| **S1 · Tensión fuera de banda** | horas con `V ∉ [209, 231]` (±5 %) ≥ 2 % de la ventana | 9,5 % ✔ (201,6–241,2 V) | 0 % (mín 213,4) | 0 % |
| **S2 · Saltos de tensión** | horas con `\|V(t) − V(t−1)\| > 10 V` ≥ 2 % | 19 % ✔ | 0 % | 0 % (σ ≈ 1,2 V) |
| **S3 · Residuo de potencia errático** | `res(t) = (kWh − V·I·PF/1000) / kWh`; al menos **2 horas con `res > +0,20` y 2 con `res < −0,20`** en la ventana | ✔ (de −73 % a +76 %; σ diaria 0,34) | ✘ (sesgo **constante** +0,26, siempre positivo) | ✘ (σ 0,04–0,06) |
| **S4 · Factor de potencia bajo** | horas con `PF < 0,80` ≥ 2 % | 7 % (mín 0,58) | 34 % (mín 0,71) | 0 % |

- `dq_score = S1 + S2 + S3` (S4 **no** cuenta: un PF bajo es un fenómeno eléctrico real, no un fallo de medida; se usa como evidencia de apoyo).
- Medidor **candidato DQ** si `dq_score ≥ 2`. Con los datos: M-112 = 3, todos los demás = 0.
- S3 es la clave que separa M-109 de M-112: en M-109 la relación P vs V·I·PF cambia de forma sistemática (carga nueva con PF distorsionado: física), en M-112 cambia de signo hora a hora (medida imposible).

### 6.4 Correlación (contexto eléctrico del segmento)

Para cada candidato con segmento, se comparan las medias dentro del segmento con las del perfil para esas mismas horas:

| Evidencia | Regla de emisión | M-109 |
|---|---|---|
| `POWER_FACTOR_DROP` | `pf_mean_seg ≤ pf_baseline − 0,10` | 0,94 → 0,73 ✔ |
| `VOLTAGE_SAG` | `v_mean_seg ≤ v_baseline − 2 V` | 220,0 → 216,4 V ✔ |
| `CURRENT_CHANGE` | `\|Δ I\| ≥ 25 %` | ≈150 A → ≈320 A ✔ |

M-104 y M-106 no emiten nada aquí (su V/PF siguen normales): la subida de M-104 es "limpia", coherente con una línea de producción nueva bien dimensionada. Esta distinción es lo que da al decisor motivos para HIGH en M-109 y MEDIUM en M-104.

### 6.5 Correlación con eventos

Para cada candidato, se buscan eventos del mismo medidor con `|event.timestamp − anchor| ≤ 24 h`, donde `anchor` = inicio del segmento (o primera hora con señal DQ).

| Tipo de evento | Relación | Efecto |
|---|---|---|
| `SCHEDULED_OUTAGE`, `MAINTENANCE` | `explains` si el segmento es una **bajada** | habilita FALSE_POSITIVE. Si la descripción contiene `N hours` y `segment_hours ≤ 1,5·N` → evidencia extra `DURATION_MATCH` (M-106: 12 h declaradas, 12 h observadas). |
| `OPERATIONAL_CHANGE` | `explains` si el segmento es una **subida** | habilita EXPLAINABLE_ANOMALY |
| `DATA_QUALITY` | `corroborates_dq` | evidencia de apoyo para DATA_QUALITY (M-112, 2026-09-13 00:00) |
| `UNKNOWN` | `reported_no_explanation` | **no explica nada.** Se muestra tal cual: "evento UNKNOWN registrado a las 14:00 del 12/09: 'No operational event reported'". Es el caso M-109 y es una trampa deliberada del dataset. |

Sin evento que explique → evidencia `NO_EXPLAINING_EVENT`.

### 6.6 Esquema de evidencia

```python
class Evidence(BaseModel):
    kind: Literal[
        "CONSUMPTION_DEVIATION", "VOLTAGE_OUT_OF_BAND", "VOLTAGE_JUMPS", "POWER_RESIDUAL_ERRATIC",
        "LOW_POWER_FACTOR", "POWER_FACTOR_DROP", "VOLTAGE_SAG", "CURRENT_CHANGE",
        "EVENT_EXPLAINS", "EVENT_CORROBORATES_DQ", "EVENT_REPORTED_UNKNOWN", "NO_EXPLAINING_EVENT", "DURATION_MATCH"]
    weight: Literal["primary", "supporting"]
    window_from: datetime
    window_to: datetime
    observed: float | None            # valor observado (p. ej. 2200.6 kWh/día, 0.73)
    expected: float | None            # baseline (1050.2, 0.94)
    unit: str | None                  # "kWh", "V", "A", "" (PF), "%"
    deviation_pct: float | None       # +110.3
    share_pct: float | None           # % de horas afectadas (señales DQ)
    event_id: int | None
    text_es: str                      # frase para UI y LLM
    text_en: str                      # frase para Jev

class Candidate(BaseModel):
    meter_id: str
    segment: Segment | None           # from, to, hours, mean_dev_pct, direction
    dq_score: int
    evidence: list[Evidence]
    explaining_event: EventRecord | None
    events: list[tuple[EventRecord, str]]   # (evento, relación)
```

`verbalize(evidence, lang)` es una tabla de plantillas `kind × {es, en}` en `evidence.py`. Ejemplos generados para M-109:

- es: *«El consumo medio en la ventana 12/09 14:00 – 14/09 23:00 (58 h) es un 110,3 % superior al baseline horario (≈ 2.200 kWh/día frente a ≈ 1.050 kWh/día).»*
- en: *"Average consumption during 2026-09-12 14:00 – 2026-09-14 23:00 (58 h) is 110.3% above the hourly baseline (~2,200 kWh/day vs ~1,050 kWh/day)."*

Los números se formatean **una sola vez**, en esta función; el LLM y la UI reciben las mismas cifras, y el validador anti-invención (7.4) las usa como conjunto permitido.

### 6.7 Verificación de los 4 casos con el método

| Medidor | Segmento | dq_score | Contexto eléctrico | Evento | Tipo esperado | Severidad esperada |
|---|---|---|---|---|---|---|
| M-104 | +46 %, 96 h | 0 | limpio | OPERATIONAL_CHANGE explica (subida) | EXPLAINABLE_ANOMALY | MEDIUM (≥25 %, ≥48 h) |
| M-106 | −80 %, 12 h | 0 | limpio | SCHEDULED_OUTAGE explica (bajada) + DURATION_MATCH | FALSE_POSITIVE | LOW |
| M-109 | +110 %, 58 h | 0 | PF↓ V↓ I↑ | UNKNOWN (no explica) | REAL_ANOMALY | HIGH |
| M-112 | ninguno | 3 | — | DATA_QUALITY corrobora | DATA_QUALITY | HIGH |
| 8 restantes | ninguno | 0 | — | — | — | — |

---

## 7. Frontera de IA

### 7.1 Puertos

```python
class Decision(BaseModel):
    type: Literal["REAL_ANOMALY","EXPLAINABLE_ANOMALY","FALSE_POSITIVE","DATA_QUALITY"]
    severity: Literal["LOW","MEDIUM","HIGH"]
    priority: bool
    confidence: float                                # 0..1
    type_probabilities: dict[str, float] | None
    severity_probabilities: dict[str, float] | None
    priority_probability: float | None
    provider: Literal["jev","rules"]
    notes: list[str] = []

class Explanation(BaseModel):
    reason: str
    recommended_action: str
    provider: str                                    # "llm:<model>" | "template"
    notes: list[str] = []

class DecisionProvider(Protocol):
    name: str
    async def decide(self, candidate: Candidate) -> Decision: ...

class ExplanationProvider(Protocol):
    name: str
    async def explain(self, candidate: Candidate, decision: Decision) -> Explanation: ...
```

`factory.build_providers(settings)` devuelve dos objetos `WithFallback(primary, fallback)` (una clase genérica de 15 líneas): intenta `primary` con timeout + 1 reintento; si falla o no hay clave, usa `fallback` y añade la nota (`"jev:no_api_key"`, `"jev:timeout"`, `"llm:http_502"`). El pipeline no sabe cuál respondió; lo lee del resultado.

### 7.2 Jev (`ai/jev.py`)

**Idioma: inglés** para el estado y las preguntas. Razón: es un clasificador de preguntas cerradas sin salida de texto, su idioma nunca llega al usuario, y los clasificadores rinden mejor en inglés. La UI y el LLM usan `text_es`. El coste es una columna más en la tabla de plantillas, nada más.

**Estado que recibe** (`to_jev_state(candidate)`):

```
Electricity meter M-109. Hourly readings over 14 days; the first 7 days are the trusted baseline.
Findings (all figures pre-computed):
- Average consumption during 2026-09-12 14:00 – 2026-09-14 23:00 (58 h) is 110.3% above the hourly baseline (~2,200 kWh/day vs ~1,050 kWh/day).
- Power factor averaged 0.73 during the window versus 0.94 in the baseline (minimum 0.71).
- Mean voltage dropped from 220.0 V to 216.4 V during the window (minimum 213.4 V).
- Mean current rose from ~150 A to ~320 A during the window.
- Voltage stayed within the ±5% band; no voltage jumps; the power relationship P ≈ V·I·PF is stable (not erratic).
Known events for this meter:
- 2026-09-12 14:00, type UNKNOWN: "No operational event reported". This event does not explain the change.
No operational change, outage or maintenance explains the deviation.
```

La última línea "negativa" (qué NO pasa) se emite siempre: a un clasificador le ayuda tanto la ausencia de señales DQ como su presencia.

**Preguntas (fijas, en `jev.py`):**

| Tipo | Pregunta | Opciones |
|---|---|---|
| Choice | *What best describes this meter's situation?* | `REAL_ANOMALY` — "Consumption changed significantly and no known operational event explains it." · `EXPLAINABLE_ANOMALY` — "Consumption changed and a known operational change (new load, new process) explains it; the new level is legitimate." · `FALSE_POSITIVE` — "The deviation is fully explained by a planned outage or maintenance; nothing to investigate." · `DATA_QUALITY` — "The readings themselves are unreliable: voltage jumps, values outside the operating band, physically inconsistent power." |
| Score | *How severe is the operational impact of this situation?* | escala ordenada `LOW < MEDIUM < HIGH` |
| Noul | *Does this case require priority investigation by a field technician?* | sí/no |

**Mapeo:** `type = argmax(Choice)`, `severity = round(Score)`, `priority = P(Noul) ≥ 0,5`, `confidence = conf(Choice) · conf(Score) · P(respuesta de prioridad)`, compuesta en código a partir de la estadística `confidence` que Jev devuelve por pregunta, siguiendo su documentación ("decompose into atomic questions, combine in code"). Con el dataset: M-109 0,81 · M-112 0,93 · M-104 0,89 · M-106 0,95. Se probó y descartó una cuarta pregunta "meta" al modelo sobre su propia certeza: no es un uso previsto de Score y mezclaba juicios. Las tres distribuciones se guardan en `AiMeta` para mostrarlas en Investigation.

**Guardrails (post-Jev, en `services`/nodo 6, no en el adaptador):** dos reglas duras que la evidencia hace incuestionables; si Jev las viola, la decisión de ese candidato pasa a `rules` y se anota `guardrail:G1|G2`.

- **G1:** `EXPLAINABLE_ANOMALY` o `FALSE_POSITIVE` requieren `explaining_event ≠ None`.
- **G2:** `DATA_QUALITY` requiere `dq_score ≥ 1`.

No se corrige la severidad ni la confianza baja: se muestran tal cual (transparencia > cosmética).

**Timeouts/reintentos:** `JEV_TIMEOUT_SECONDS=10` por llamada, 1 reintento con 1 s de espera solo en timeout / 5xx / error de red; 4xx (clave inválida) → fallback inmediato sin reintento y nota `jev:auth`.

### 7.3 Reglas (`ai/rules.py`) — fallback y guardrail

```
if dq_score >= 2:
    type = DATA_QUALITY
    severity = HIGH if (dq_score == 3 or S4) else MEDIUM
elif segment:
    if explaining_event:
        type = FALSE_POSITIVE if explaining_event.type in {SCHEDULED_OUTAGE, MAINTENANCE} else EXPLAINABLE_ANOMALY
    else:
        type = REAL_ANOMALY
    severity:
        REAL_ANOMALY        → HIGH if |dev| >= 50 % or POWER_FACTOR_DROP in evidence else MEDIUM
        EXPLAINABLE_ANOMALY → MEDIUM if |dev| >= 25 % and hours >= 48 else LOW
        FALSE_POSITIVE      → LOW
priority = type in {REAL_ANOMALY, DATA_QUALITY} and severity == HIGH
```

**Confianza por reglas** (suma acotada a `[0,50, 0,97]`): base `0,70`; `+0,15` si `|dev| ≥ 50 %`; `+0,10` si `|dev| ≥ 100 %`; `+0,05` por evidencia eléctrica de apoyo (máx `+0,10`); `+0,15` si el evento explicativo cae a ≤ 1 h del inicio del segmento; `+0,05` por `DURATION_MATCH`; para DQ: base `0,60 + 0,10·dq_score`, `+0,05` si un evento `DATA_QUALITY` corrobora. Resultado con los datos: M-109 0,97 · M-112 0,95 · M-106 0,90 · M-104 0,85. `type_probabilities = None` (no se fabrican distribuciones falsas).

### 7.4 LLM vía OpenRouter (`ai/openrouter.py`)

```python
llm = ChatOpenAI(
    base_url=settings.openrouter_base_url, api_key=settings.openrouter_api_key,
    model=models[0], timeout=settings.llm_timeout_seconds, max_retries=0,
    extra_body={"models": models, "provider": {"require_parameters": True}},
).with_structured_output(ExplanationOut, method="json_schema")   # {reason: str, recommended_action: str}
```

**Prompt (system, español):**

> Eres un analista senior de energía de una compañía eléctrica. Recibes la clasificación ya decidida de un caso y la evidencia numérica calculada por el sistema. Redacta en español: (1) `reason`: máximo dos frases que expliquen la clasificación citando al menos una cifra de la evidencia; (2) `recommended_action`: una frase imperativa, coherente con el tipo y la severidad. Reglas: usa **únicamente** las cifras que aparecen en la evidencia, nunca inventes ni redondees de otra forma; no contradigas la clasificación; no menciones que eres una IA.

**User:** tipo, severidad, prioridad, lista de `text_es`, eventos con su relación, y una guía de acción por tipo (REAL → investigar instalación/carga; EXPLAINABLE → actualizar baseline y revisar contrato/potencia; FALSE_POSITIVE → cerrar sin acción, registrar; DATA_QUALITY → revisar medidor/comunicaciones y cuarentenar lecturas).

**Validador anti-invención** (post-respuesta, 10 líneas): se extraen con regex todos los números de `reason` y `recommended_action`, se normalizan (coma/punto, separador de miles) y cada uno debe coincidir con alguna cifra presente en `text_es` de la evidencia (tolerancia ±0,05 absoluto para permitir 110,3 ↔ 110). Si alguno no coincide, o el texto está vacío, o `reason` supera 400 caracteres → se descarta y se usa plantilla con nota `llm:invalid_numbers`. La identidad del modelo que respondió se lee de `response_metadata["model_name"]` y va a `provider = "llm:<model>"`.

**Timeouts/reintentos:** `LLM_TIMEOUT_SECONDS=20` por intento; el array `models` ya hace fallback entre modelos en el lado de OpenRouter; 1 reintento propio solo en timeout/5xx/red; después, plantilla. Concurrencia máx. 4 llamadas simultáneas (semáforo) para no disparar rate-limits de modelos gratuitos.

### 7.5 Plantillas (`ai/templates.py`)

Una por tipo, rellenadas con las cifras ya formateadas del `Candidate`:

| Tipo | `reason` | `recommended_action` |
|---|---|---|
| REAL_ANOMALY | «Consumo {dev} % por encima del baseline durante {hours} h sin evento operativo conocido{electrical_clause}.» | «Investigar el medidor y la instalación: verificar cargas no declaradas y estado del factor de potencia.» |
| EXPLAINABLE_ANOMALY | «Consumo {dev} % por encima del baseline desde {from}, coincidente con el evento "{event}" del {event_ts}.» | «Actualizar el baseline del medidor y revisar la potencia contratada; no requiere intervención en campo.» |
| FALSE_POSITIVE | «Caída del {dev} % durante {hours} h que coincide con "{event}" programado para el {event_ts}; el consumo se recupera al finalizar.» | «Cerrar sin acción y registrar como parada planificada.» |
| DATA_QUALITY | «Lecturas inconsistentes desde {from}: tensión entre {vmin} y {vmax} V, factor de potencia mínimo {pfmin} y relación P≈V·I·PF errática en {share} % de las horas; el consumo se mantiene estable.» | «Revisar el medidor y su comunicación; poner en cuarentena las lecturas del periodo antes de facturar.» |

`{electrical_clause}` = «; el factor de potencia cae de {pf_base} a {pf_seg}» cuando existe `POWER_FACTOR_DROP`.

### 7.6 Registro de proveedor

Cada `Anomaly.ai_meta` guarda `decision_provider`, `explanation_provider`, las tres distribuciones de Jev (o `null`), `fallback_notes` y latencias. `AnalysisRun.providers` guarda lo configurado al arrancar el run. La UI muestra un badge por anomalía («Decidido por Jev · Explicado por plantilla») y el dashboard el modo global. Un evaluador sin claves ve exactamente el mismo flujo con `rules/template`.

---

## 8. Configuración

`app/config.py`:

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: Literal["development","test","production"] = "development"
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]       # coma-separado en env
    database_url: str = "sqlite:///./energy.db"
    data_dir: Path = Path("./data")
    typesafe_api_key: str | None = None
    jev_timeout_seconds: float = 10
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    llm_models: list[str] = ["nvidia/nemotron-3-super-120b-a12b:free", "qwen/qwen3.8-27b:free", "dots-studio/dots-3-note-preview:free"]
    llm_timeout_seconds: float = 20
    analysis_timeout_seconds: float = 120
    demo_user: str = "admin"
    demo_password: str = "admin"

    @property
    def decision_mode(self) -> str: return "jev" if self.typesafe_api_key else "rules"
    @property
    def explanation_mode(self) -> str: return "llm" if self.openrouter_api_key else "template"
```

`.env.example` (contenido completo):

```dotenv
# --- Server ---
APP_ENV=development
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=sqlite:///./energy.db
DATA_DIR=./data

# --- Decision provider: Jev (TypeSafe AI). Leave empty -> rule-based fallback ---
TYPESAFE_API_KEY=
JEV_TIMEOUT_SECONDS=10

# --- Explanation provider: OpenRouter (OpenAI-compatible). Leave empty -> template fallback ---
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Tried in order via OpenRouter "models" fallback array. Only free models with structured_outputs support.
LLM_MODELS=nvidia/nemotron-3-super-120b-a12b:free,qwen/qwen3.8-27b:free,dots-studio/dots-3-note-preview:free
LLM_TIMEOUT_SECONDS=20

# --- Analysis ---
ANALYSIS_TIMEOUT_SECONDS=120

# --- Demo login (no real auth) ---
DEMO_USER=admin
DEMO_PASSWORD=admin
```

Los umbrales analíticos **no** están aquí a propósito (sección 6): son parte del método, no del entorno.

---

## 9. Estrategia de testing

`uv run pytest` sin red, sin claves, en < 10 s. `conftest.py` fuerza `TYPESAFE_API_KEY=""` y `OPENROUTER_API_KEY=""` para que los fallbacks sean el camino por defecto.

| Nivel | Fichero | Qué se prueba | Cómo |
|---|---|---|---|
| Unit | `test_detectors.py` | `hourly_profile` (mediana por hora, ventana 7 días); `detect_segments` en series sintéticas: ruido ±5 % → 0 segmentos; escalón +40 % desde la hora 200 → 1 segmento con inicio exacto; caída −80 % de 12 h → 1 segmento de 12 h; racha de 5 h → 0 (umbral 6); señales DQ: saltos de ±20 V inyectados → S1+S2; residuo con signo alterno → S3; residuo con sesgo constante → no S3 | fixture `synthetic_meter(profile, noise, inject=...)` que genera 336 h con perfil diurno |
| Unit | `test_correlation.py` | ventana ±24 h; `SCHEDULED_OUTAGE` explica bajadas pero no subidas; `UNKNOWN` nunca explica; `DATA_QUALITY` corrobora; `DURATION_MATCH` parsea "12 hours" | candidatos construidos a mano |
| Unit | `test_rules.py` | tabla tipo/severidad/prioridad de 7.3 y confianza acotada; guardrails G1/G2 con `Decision` de un Jev falso que contradice la evidencia | `FakeDecisionProvider(returns=...)` |
| Unit | `test_providers.py` | adaptador Jev con cliente stub: mapeo argmax/confianza/Noul, timeout → fallback con nota; adaptador LLM: validador acepta «110,3 %», rechaza «115 %» y textos vacíos; `WithFallback` registra notas | stubs `httpx`/objetos falsos, sin red |
| Integración | `test_pipeline_ground_truth.py` | `build_graph().ainvoke` sobre los CSV reales con proveedores fallback: exactamente 4 anomalías; `{M-104: (EXPLAINABLE, MEDIUM), M-106: (FALSE_POSITIVE, LOW), M-109: (REAL, HIGH), M-112: (DATA_QUALITY, HIGH)}`; `ranked[0].meter_id == "M-109"`; `priority_count == 2`; los otros 8 ausentes; headline exacto | es **el** test de regresión del método |
| API | `test_api.py` | TestClient sobre SQLite temporal con seed real: contrato de cada endpoint (shape, filtros, orden, 404, 400 rango invertido, 422); `POST /ai/analyze` dos veces seguidas → mismo id y `reused=true`; polling hasta COMPLETED y `GET /anomalies` coherente; `PATCH` estado y carry-over tras segundo run; `/health` reporta `rules/template` | `AnalysisRunner.wait(run_id)` (expone el `Task`) evita `sleep` en tests |

Con clave real, `pytest -m live` (marcado, opcional) ejecuta el pipeline con Jev/LLM y asserta lo mismo salvo la confianza exacta. No corre en CI.

---

## 10. Errores y observabilidad

### 10.1 Formato de error (único)

```json
{ "error": { "code": "METER_NOT_FOUND", "message": "No existe el medidor 'M-999'.",
             "details": { "meter_id": "M-999" }, "request_id": "8f3c…" } }
```

`errors.py` define `AppError(code, status_code, message, details)` y tres handlers: `AppError` → su status; `RequestValidationError` → `422 VALIDATION_ERROR` con `details.errors`; `Exception` → `500 INTERNAL_ERROR` sin filtrar el traceback (queda en log con el `request_id`).

Códigos: `INVALID_CREDENTIALS`, `METER_NOT_FOUND`, `ANOMALY_NOT_FOUND`, `RUN_NOT_FOUND`, `INVALID_RANGE`, `VALIDATION_ERROR`, `SEED_INVALID` (arranque), `INTERNAL_ERROR`, `DB_UNAVAILABLE`.

### 10.2 Logging

`logging` estándar, formato `key=value` en una línea, `request_id` por `contextvars` inyectado por el middleware (header `X-Request-ID` de entrada o uuid4; se devuelve siempre en la respuesta). Eventos mínimos: `http.request` (method, path, status, duration_ms), `run.stage` (run_id, stage, status, duration_ms, detail), `ai.call` (run_id, meter_id, provider, outcome, latency_ms, note), `run.finished` (run_id, status, anomalies, priority). Sin tracing distribuido: un proceso, un loop.

### 10.3 Degradación de la IA hacia la UI

| Fallo | Comportamiento | Lo que ve el usuario |
|---|---|---|
| Sin `TYPESAFE_API_KEY` | `rules` desde el arranque | badge "Decisión: reglas" en dashboard y por anomalía |
| Jev timeout/5xx tras reintento | `rules` para ese candidato, nota `jev:timeout` | badge por anomalía + tooltip con la nota |
| Jev viola G1/G2 | `rules`, nota `guardrail:G1` | idem; en Investigation se muestra la distribución de Jev igualmente |
| LLM falla/inválido | plantilla, nota `llm:<motivo>` | badge "Explicación: plantilla" |
| Excepción en etapas 1–5/7 | run `FAILED`, `error` legible, etapa en `failed` | el stepper marca la etapa en rojo y ofrece reintentar; las anomalías del run anterior siguen visibles |
| Timeout global (120 s) | run `FAILED`, `error.code = "TIMEOUT"` | idem |

Principio: **la IA puede fallar; el análisis no.** El único camino a FAILED es un error de datos o de programación, y ese sí debe verse.

---

## 11. Decisiones y alcance (para citar)

| No se hace | Por qué | Cómo se haría si hiciera falta |
|---|---|---|
| Autenticación real / verificación del token | El enunciado pide una pantalla de login, no un sistema de identidad. Un JWT sin usuarios reales sería teatro. | Dependencia `require_user` con JWT firmado; tabla `users`; 1 día. |
| Multi-tenant | Un cliente, un conjunto de medidores. | `tenant_id` en `meters` y filtro en `get_db`. |
| Alembic / migraciones | Esquema nuevo, BD de un fichero, `create_all` en el arranque; borrar `energy.db` es la migración. | `alembic init` + autogenerate cuando haya datos que conservar. |
| Caché (Redis/lru) | 4.032 filas: todo cuesta milisegundos; una caché añadiría invalidación que hoy no existe. | `lru_cache` por `(run_id)` en `services/meters.py` a partir de ~100k lecturas. |
| Paginación | Listas de 12 medidores, 336 lecturas y 4 anomalías. | `limit/offset` + `total`; el shape `{items, total}` ya lo prevé. |
| Cola externa / workers | Un run cada vez, en proceso. | Celery/RQ con la misma `AnalysisRunner` como worker; el contrato API no cambia. |
| Checkpointer de LangGraph | El grafo dura segundos y el progreso vive en `analysis_runs`. | `SqliteSaver` si hiciera falta reanudar runs largos. |
| ML entrenado (Isolation Forest, Prophet…) | 14 días y 12 series: una regla transparente y verificable gana a un modelo que nadie podría explicar en la entrevista. Lo explicable *es* el requisito. | Sustituir `detect_segments` detrás de la misma firma. |
| Zona horaria | El dataset no la trae; inventarla generaría desplazamientos falsos. | Columna `tz` en `meters`, timestamps aware. |
| Streaming (SSE/WebSocket) del progreso | Polling cada 700 ms sobre 7 etapas es indistinguible para el usuario y no requiere infraestructura. | `EventSourceResponse` leyendo el mismo `analysis_runs.stages`. |
| `expected_results.csv` | Nunca se usa ni se referencia: los 4 casos se validan con la evidencia de los datos, no contra la respuesta. | — |

---

## Apéndice A · Cifras de referencia del dataset (para la defensa)

- 12 medidores · 336 h cada uno · `2026-09-01 00:00` → `2026-09-14 23:00` · sin huecos · `status = OK` en las 4.032 filas.
- Tensión nominal observada ≈ 220 V (σ ≈ 1,2 V en medidores normales). PF normal 0,90–0,96.
- Desviación diaria de los 8 medidores normales frente a su baseline: entre −3 % y +2 %.
- M-104: 1.170 → 1.715 kWh/día desde el 11/09 (+46 %). V y PF sin cambios.
- M-106: 852 kWh el 08/09 (−37 % diario); horas 00–11 a ≈ 9–13 kWh frente a 55 de baseline (−80 %); recupera a las 12:00.
- M-109: 1.050 → 1.569 kWh (12/09, cambio a las 14:00) → 2.194 / 2.208 kWh (13–14/09). PF 0,94 → 0,73 (mín 0,71). V 220,0 → 216,4 V (mín 213,4). I ≈ 150 → 320 A.
- M-112: consumo 653–668 kWh/día todo el periodo. Desde el 13/09 00:00: V 201,6–241,2 V, saltos > 10 V en 19 % de las horas, PF mín 0,58, residuo P vs V·I·PF entre −73 % y +76 %.
- `events.csv`: 4 filas — M-104 `OPERATIONAL_CHANGE` 11/09 00:00 · M-106 `SCHEDULED_OUTAGE` 08/09 00:00 ("12 hours") · M-109 `UNKNOWN` 12/09 14:00 · M-112 `DATA_QUALITY` 13/09 00:00.
