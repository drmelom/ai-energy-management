# Data visualization & UI spec — AI Energy Management Platform

**Alcance:** frontend `frontend/` (Vite + React 19 + TypeScript · Tailwind CSS v4 · Recharts 3.10 · react-router 7). Este documento se implementa tal cual: cada gráfico tiene pregunta, encoding, componentes Recharts y transformación de datos. Fuentes de verdad: `docs/DATA_ANALYSIS.md` (cifras), `backend/ARCHITECTURE.md` §3–4 (shapes JSON), §6.6 (Evidence), §10.3 (degradación IA).

**Principio rector:** el gráfico dice la verdad rápido. Posición y longitud para cantidades; el color solo para *estado* (status/severity) e *identidad* (tipo de anomalía), nunca como único portador; cero ejes duales; barras siempre desde cero; ejes de línea no-cero solo donde se justifica y se etiqueta.

**Regla ponytail aplicada:** Recharts se usa **solo** donde hay una serie temporal (kWh, V, I, PF). Todo lo que es "N barras con etiqueta" (variación por medidor, confianza, probabilidades de Jev) se hace con `<div>` + CSS: mismo resultado perceptual, cero overhead, se reutiliza dentro de tablas.

---

## 0. Decisiones en una tabla

| Tema | Decisión | Rechazado | Por qué |
|---|---|---|---|
| Vista de flota (dashboard) | Lista de 12 filas ordenada por urgencia con barra inline de variación % + badge de tipo/severidad | Small multiples (12 sparklines), heatmap medidor×día, donut por tipo | M-112 tiene consumo **plano** (+0,1 %): ninguna codificación de consumo lo revela. Solo el color/badge de severidad lo hace. Ordenar por urgencia pone M-109 y M-112 en las filas 1–2. |
| Serie principal del medidor | `ComposedChart`: `Area` banda ±25 % (umbral de detección) + `Line` baseline + `Line` real; `ReferenceArea` ventana anómala; `ReferenceLine` evento | Baseline solo como línea; banda ±σ | La banda ±25 % **es** la regla del detector (§6.2 ARCHITECTURE): lo que sale de la banda es lo que la IA marcó. M-112 queda dentro → "su consumo es normal" se ve sin leer. |
| Eje Y kWh | Desde 0 | Auto-domain | La historia de M-109 es "×2,1" y la de M-106 "casi a cero"; con eje truncado ambas mienten. El `Area` de la banda además exige base cero. |
| Eje Y tensión | Dominio acotado `[floor(min)−3, ceil(max)+3]`, con zonas fuera de ±5 % sombreadas y línea 220 V; etiqueta "eje no parte de cero" | Desde 0 | Desde 0, un salto de 20 V sobre 240 es un 8 % de la altura: M-112 desaparece. Es una línea, no una barra: el eje no-cero es legítimo si se declara. |
| V / I / PF | Tres gráficos apilados (small multiples) con `syncId`, misma anchura y márgenes | Un gráfico con ejes normalizados; eje dual | Unidades y rangos incomparables (V≈220, PF 0,5–1, I 50–500 A). Normalizar a baseline=100 oculta absolutos que importan (241 V vs 201 V). El eje dual fabrica correlaciones. |
| Confianza y probabilidades | Número + barra horizontal CSS (`HBar`) | Gauge, donut, radar | Un gauge codifica un valor en ángulo y ocupa 80×80 px para lo que hace una barra de 64×6 px + "96 %". |
| Antes/después | Tabla de 4 filas (variable · baseline · ventana · Δ) | Dumbbell chart | Cuatro variables con cuatro unidades = cuatro ejes. La tabla es el encoding honesto. |
| Progreso del análisis | Stepper **vertical** (timeline) de 7 pasos | Stepper horizontal, barra de progreso | El `detail` de cada etapa es una frase; horizontal a 1366 px trunca. Vertical se lee como un log. |
| Sparklines en KPI | Ninguna | Sparkline de 14 días | 8 de 12 medidores son planos; la serie de flota es una línea recta con +6 % de ruido. La API tampoco la expone (serían 12 llamadas para decoración). |
| Escalas secuencial / divergente | **Ninguna** en el MVP | Divergente azul↔rojo para variación % | La variación se codifica en longitud (barra) + signo textual; el color de la barra es *severidad* (énfasis: gris para normales). Una escala divergente añadiría una leyenda continua para 12 valores. |
| Navegación | Sidebar izquierda colapsable | Top nav | 5 destinos + acción global + badge de modo IA: la sidebar deja la barra superior para título de página y CTA; colapsa a iconos en tablet. |
| Iconos | 8 paths SVG inline copiados de Lucide (ISC) en `Icon.tsx` | `lucide-react`, emoji | Cero dependencias nuevas; 8 iconos bastan (4 status/severidad + 4 tipos). |

---

## 1. Lenguaje visual: status, severidad, tipo

### 1.1 Reglas

1. **El color nunca va solo.** Todo badge = icono + texto + color. Todo mark coloreado por estado tiene su valor en texto (etiqueta directa o tabla).
2. **Status y severidad comparten la escala semántica** (verde / ámbar / rojo / pizarra) porque significan lo mismo para el operador. `LOW` **no** es verde: es pizarra neutra ("hay algo, no urge").
3. **Los tipos de anomalía son identidad, no estado** → tonos categóricos (violeta / naranja / aguamarina) distintos de la escala semántica, y `FALSE_POSITIVE` en pizarra neutra porque *es* la clase "nada que investigar" (de-énfasis deliberado).
4. **Un solo acento** (azul) reservado para: serie "consumo real", botones primarios, links, focus ring. Ningún tipo ni estado usa azul.
5. **Texto nunca lleva el color del dato**: las etiquetas usan tinta (`ink`, `ink-2`, `ink-3`); el color va en el mark o en el badge (con su propio par fondo/tinta validado).

### 1.2 Validación (dataviz skill, `validate_palette.js`)

| Conjunto | Modo | Resultado |
|---|---|---|
| Tipos cromáticos violeta · naranja · aguamarina (`#4a3aa7,#eb6834,#1baf7a`) | light, `--pairs all` | PASS: peor par CVD ΔE 9,2 (deutan), visión normal ΔE 27,6. WARN contraste aguamarina 2,74:1 → relief obligatorio = badge siempre con texto e icono (cumplido por regla 1). |
| Tipos cromáticos (`#9085e9,#d95926,#199e70`) | dark, superficie `#1a1a19`, `--pairs all` | PASS: peor par CVD ΔE 9,4, visión normal 24,6, contraste ≥ 3:1 los tres. |
| Violeta + **azul** en dark | dark | **FAIL** (ΔE 1,9 protan, 9,8 normal) en todas las variantes probadas → por eso el azul queda fuera de los tipos y es solo acento. |
| Status verde/ámbar/rojo | ambos | El validador categórico marca rojo↔verde ΔE 4,1 (deutan). **Esperado y documentado en el skill**: los status son una escala fija que se mitiga con icono + texto, y en ningún gráfico se sientan uno junto al otro (en la vista de flota los normales van en gris de de-énfasis, no en verde). |

Contrastes WCAG de tintas (calculados con `contrast()` del validador): ver columnas "contraste" abajo. Todo texto de badge ≥ 4,3:1; toda tinta de tabla ≥ 6:1.

### 1.3 Tokens (CSS variables) — light / dark

Cromo (tomado del palette de referencia del skill):

| Token | Uso | Light | Dark |
|---|---|---|---|
| `--page` | fondo de página | `#f9f9f7` | `#0d0d0d` |
| `--surface` | cards, tabla, área de gráfico | `#fcfcfb` | `#1a1a19` |
| `--surface-2` | filas hover, headers de tabla | `#f3f3f0` | `#232322` |
| `--ink` | texto primario, valores | `#0b0b0b` | `#ffffff` |
| `--ink-2` | texto secundario (7,7:1 / 9,7:1) | `#52514e` | `#c3c2b7` |
| `--ink-3` | ejes, labels de gráfico (3,5:1 → solo texto ≥ 12 px no esencial) | `#898781` | `#898781` |
| `--grid` | gridlines hairline 1 px sólido | `#e1e0d9` | `#2c2c2a` |
| `--axis` | línea de eje / baseline cero | `#c3c2b7` | `#383835` |
| `--border` | hairline de cards | `rgba(11,11,11,.10)` | `rgba(255,255,255,.10)` |
| `--mark-neutral` | barras de medidores normales (de-énfasis) | `#c3c2b7` | `#4a4a47` |
| `--accent` | serie consumo real, botón primario, links | `#2a78d6` | `#3987e5` |
| `--accent-ink` | texto sobre surface en acento (6,5:1 / 7,0:1) | `#1c5cab` | `#6da7ec` |
| `--accent-wash` | área bajo la serie real (10 %) | `rgba(42,120,214,.10)` | `rgba(57,135,229,.14)` |
| `--baseline` | línea baseline | `#898781` | `#a5a49c` |
| `--band` | banda ±25 % | `rgba(137,135,129,.14)` | `rgba(165,164,156,.16)` |

Semánticos (status + severidad). Cada rol tiene **fill** (marks, dots), **ink** (texto sobre surface o sobre wash) y **wash** (fondo de badge / sombreado de ventana):

| Rol | Mapea | Icono (Lucide) | fill L / D | ink L / D (contraste sobre surface) | wash L / D |
|---|---|---|---|---|---|
| `ok` | status `NORMAL` | `circle-check` | `#0ca30c` / `#0ca30c` | `#006300` (7,4) / `#4ade80` (10,0) | `#e6f4e6` / `#14301c` |
| `warning` | status `WARNING`, severidad `MEDIUM` | `triangle-alert` | `#b87700` (3,6) / `#fab219` (9,5) | `#8a5a00` (5,8) / `#f5b942` (9,9) | `#fdf1d6` / `#3a2a08` |
| `critical` | status `CRITICAL`, severidad `HIGH` | `octagon-alert` | `#d03b3b` (4,7) / `#d03b3b` (3,6) | `#b42323` (6,4) / `#f07171` (6,1) | `#fbe3e3` / `#3d1717` |
| `neutral` | severidad `LOW`, status `UNKNOWN`, tipo `FALSE_POSITIVE` | `circle-minus` | `#7a8699` (3,6 / 4,7) | `#526075` (6,2) / `#a3b0c2` (7,9) | `#eef0f3` / `#2a2d33` |

> Nota: el fill ámbar light es `#b87700` (3,6:1) y no el `#fab219` del palette de referencia (1,8:1) porque aquí el ámbar se usa como **fill de barra** en la vista de flota; en dark sí se usa `#fab219`.

Tipos de anomalía (identidad):

| Tipo | Etiqueta ES | Icono | fill L / D (contraste) | ink L / D | wash L / D | Orden fijo |
|---|---|---|---|---|---|---|
| `REAL_ANOMALY` | Anomalía real | `siren` | `#4a3aa7` (8,3) / `#9085e9` (5,6) | `#4a3aa7` / `#9085e9` | `#ebe8f7` / `#26224a` | 1 |
| `DATA_QUALITY` | Calidad de dato | `activity` | `#eb6834` (3,1) / `#d95926` (4,5) | `#b4460f` (5,4) / `#f0855a` | `#fdebe3` / `#3d2216` | 2 |
| `EXPLAINABLE_ANOMALY` | Explicable | `clipboard-check` | `#1baf7a` (2,7 → relief) / `#199e70` (5,1) | `#0f7a55` (5,2) / `#4fd39f` | `#e3f6ee` / `#123326` | 3 |
| `FALSE_POSITIVE` | Falso positivo | `circle-minus` | `#7a8699` / `#7a8699` | `#526075` / `#a3b0c2` | `#eef0f3` / `#2a2d33` | 4 |

El **orden fijo** es también el orden de urgencia para sorting y para las barras de probabilidad: nunca se reordena por valor (el color sigue a la entidad, no al ranking).

### 1.4 Tailwind v4 — `src/index.css`

```css
@import "tailwindcss";

:root {
  color-scheme: light;
  --page:#f9f9f7; --surface:#fcfcfb; --surface-2:#f3f3f0;
  --ink:#0b0b0b; --ink-2:#52514e; --ink-3:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --mark-neutral:#c3c2b7;
  --accent:#2a78d6; --accent-ink:#1c5cab; --accent-wash:rgba(42,120,214,.10);
  --baseline:#898781; --band:rgba(137,135,129,.14);
  --ok:#0ca30c; --ok-ink:#006300; --ok-wash:#e6f4e6;
  --warning:#b87700; --warning-ink:#8a5a00; --warning-wash:#fdf1d6;
  --critical:#d03b3b; --critical-ink:#b42323; --critical-wash:#fbe3e3;
  --neutral:#7a8699; --neutral-ink:#526075; --neutral-wash:#eef0f3;
  --t-real:#4a3aa7; --t-real-ink:#4a3aa7; --t-real-wash:#ebe8f7;
  --t-dq:#eb6834; --t-dq-ink:#b4460f; --t-dq-wash:#fdebe3;
  --t-expl:#1baf7a; --t-expl-ink:#0f7a55; --t-expl-wash:#e3f6ee;
  --t-fp:#7a8699; --t-fp-ink:#526075; --t-fp-wash:#eef0f3;
}
/* Dark: el MISMO bloque bajo dos scopes (CSS no permite reutilizar un bloque; duplicarlo literalmente o
   generarlo con una variable de PostCSS/Vite si se prefiere). El :not([data-theme="light"]) deja que el toggle
   "claro" gane al OS oscuro; el scope [data-theme="dark"] deja que el toggle "oscuro" gane al OS claro. */
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page:#0d0d0d; --surface:#1a1a19; --surface-2:#232322; --ink:#ffffff; --ink-2:#c3c2b7; --ink-3:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --mark-neutral:#4a4a47;
    --accent:#3987e5; --accent-ink:#6da7ec; --accent-wash:rgba(57,135,229,.14); --baseline:#a5a49c; --band:rgba(165,164,156,.16);
    --ok:#0ca30c; --ok-ink:#4ade80; --ok-wash:#14301c;
    --warning:#fab219; --warning-ink:#f5b942; --warning-wash:#3a2a08;
    --critical:#d03b3b; --critical-ink:#f07171; --critical-wash:#3d1717;
    --neutral:#7a8699; --neutral-ink:#a3b0c2; --neutral-wash:#2a2d33;
    --t-real:#9085e9; --t-real-ink:#9085e9; --t-real-wash:#26224a;
    --t-dq:#d95926; --t-dq-ink:#f0855a; --t-dq-wash:#3d2216;
    --t-expl:#199e70; --t-expl-ink:#4fd39f; --t-expl-wash:#123326;
    --t-fp:#7a8699; --t-fp-ink:#a3b0c2; --t-fp-wash:#2a2d33;
  }
}
:root[data-theme="dark"] { /* copia literal del bloque anterior */ }

@theme inline {
  --color-page: var(--page); --color-surface: var(--surface); --color-surface-2: var(--surface-2);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-grid: var(--grid); --color-axis: var(--axis); --color-border: var(--border);
  --color-accent: var(--accent); --color-accent-ink: var(--accent-ink);
  --color-ok: var(--ok); --color-ok-ink: var(--ok-ink); --color-ok-wash: var(--ok-wash);
  --color-warning: var(--warning); --color-warning-ink: var(--warning-ink); --color-warning-wash: var(--warning-wash);
  --color-critical: var(--critical); --color-critical-ink: var(--critical-ink); --color-critical-wash: var(--critical-wash);
  --color-neutral: var(--neutral); --color-neutral-ink: var(--neutral-ink); --color-neutral-wash: var(--neutral-wash);
  --color-t-real: var(--t-real); --color-t-real-ink: var(--t-real-ink); --color-t-real-wash: var(--t-real-wash);
  --color-t-dq: var(--t-dq); --color-t-dq-ink: var(--t-dq-ink); --color-t-dq-wash: var(--t-dq-wash);
  --color-t-expl: var(--t-expl); --color-t-expl-ink: var(--t-expl-ink); --color-t-expl-wash: var(--t-expl-wash);
  --color-t-fp: var(--t-fp); --color-t-fp-ink: var(--t-fp-ink); --color-t-fp-wash: var(--t-fp-wash);
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --radius-card: 8px; --radius-badge: 6px;
}
body { background: var(--page); color: var(--ink); }
```

`@theme inline` hace que `bg-critical-wash text-critical-ink` referencien la variable → el toggle de tema funciona sin duplicar utilidades. Recharts recibe los colores con `stroke="var(--accent)"`; funciona porque son atributos SVG resueltos por CSS.

Mapa TS único (`src/lib/semantics.ts`):

```ts
export const STATUS = { NORMAL:'ok', WARNING:'warning', CRITICAL:'critical', UNKNOWN:'neutral' } as const;
export const SEVERITY = { HIGH:'critical', MEDIUM:'warning', LOW:'neutral' } as const;
export const TYPE_ORDER = ['REAL_ANOMALY','DATA_QUALITY','EXPLAINABLE_ANOMALY','FALSE_POSITIVE'] as const;
export const TYPE = { REAL_ANOMALY:{tone:'t-real',label:'Anomalía real',icon:'siren'}, DATA_QUALITY:{tone:'t-dq',label:'Calidad de dato',icon:'activity'},
  EXPLAINABLE_ANOMALY:{tone:'t-expl',label:'Explicable',icon:'clipboard-check'}, FALSE_POSITIVE:{tone:'t-fp',label:'Falso positivo',icon:'circle-minus'} } as const;
export const SEVERITY_RANK = { HIGH:0, MEDIUM:1, LOW:2 } as const;
```

---

## 2. Pantallas, gráfico por gráfico

Convenciones comunes a todo gráfico Recharts:

| Aspecto | Regla |
|---|---|
| Contenedor | `ResponsiveContainer width="100%" height={H}`; `H` incluye la banda del eje X (nunca scroll interno). Main chart 320 px; small multiples 120 px cada uno. |
| Marks | `Line strokeWidth={2} dot={false} strokeLinejoin="round"`; `Area` fill 10–16 % opacidad; grid `CartesianGrid stroke="var(--grid)" vertical={false}` (1 px sólido, nunca `strokeDasharray`). |
| Ejes | `tick={{fill:'var(--ink-3)', fontSize:12}}`, `axisLine={{stroke:'var(--axis)'}}`, `tickLine={false}`. Y con `tickFormatter={fmtNum}`. |
| Eje X tiempo | `XAxis dataKey="t" type="number" scale="time" domain={['dataMin','dataMax']} ticks={dayTicks}`; `tickFormatter` → `"12/09"`. Numérico para que `ReferenceArea`/`ReferenceLine` acepten un timestamp exacto. |
| Tooltip | `Tooltip content={<ChartTooltip/>} cursor={{stroke:'var(--axis)'}}` (crosshair vertical). Valores en `--ink` semibold, etiqueta de serie en `--ink-2`, key = trazo de 12×2 px del color de la serie. |
| Animación | `isAnimationActive={false}` en todas las series (evita re-animar al cambiar hourly/daily y respeta `prefers-reduced-motion` sin lógica extra). |
| Leyenda | Presente cuando hay ≥ 2 series (real, baseline, banda): `Legend` custom en el header del `ChartFrame`, no dentro del plot. Los small multiples de V/I/PF tienen 2 series (real + baseline) → leyenda compartida una vez, encima del bloque. |
| Accesibilidad | `accessibilityLayer` (default en Recharts 3: teclado ← → mueve el tooltip). Wrapper con `role="figure"` + `aria-label` que **resume el hallazgo** (§5). Botón "Ver tabla" en el `ChartFrame`. |
| Loading / vacío | Loading: skeleton de la altura exacta la primera vez; en refetch (toggle hourly/daily) se mantiene el render previo a `opacity .5`, sin salto. Vacío: texto centrado "Sin lecturas en el rango" con icono `ink-3`. Error: mensaje + botón "Reintentar". |

### 2.1 Login

Sin gráficos. Card centrada 400 px sobre `--page`, logo + "AI Energy Management", campos user/password (`admin`/`admin` pre-rellenados vía placeholder, no como value), botón primario acento. Error 401 → texto `--critical-ink` bajo el formulario. Guarda `token` en `sessionStorage`; redirige a `/`.

### 2.2 Dashboard (`/`)

**Datos:** `GET /dashboard/summary` + `GET /meters?sort=severity` (una llamada cada uno).

**Fila KPI — 6 `KpiTile`** (grid 6 col a ≥ 1280 px; 3×2 a tablet). Solo números y sublíneas; sin sparklines (ver §0).

| Tile | `value` | `sub` | Acento visual |
|---|---|---|---|
| Medidores | `meters.total` → **12** | `8 ● OK · 1 ▲ Alerta · 2 ⯃ Crítico` (tres mini badges) | — |
| Consumo del periodo | `consumption.total_kwh` → **155.250,8 kWh** | `01/09 – 14/09 · media 11.089 kWh/día` | — |
| Anomalías IA | `anomalies.total` → **4** | 4 chips de tipo con conteo: `1 Real · 1 Calidad · 1 Explicable · 1 Falso +` | — |
| Prioritarias | `anomalies.priority` → **2** | `requieren investigación` | valor en `--critical-ink` si > 0 |
| Confianza IA | `avg_confidence` → **91 %** | `ProviderBadge` decisión + explicación (`ai_mode`) | `HBar` 64 px bajo el valor |
| Último análisis | relativo: **hace 3 min** | `StatusChip` COMPLETED/RUNNING/FAILED + link "Ver detalle" → `/analysis` | si `null`: valor "Nunca", sub = botón "Ejecutar análisis IA" |

Valor 28 px semibold, figuras proporcionales (no `tabular-nums`). Label 12 px `--ink-2`. Card 16 px padding, hairline `--border`.

**Vista de flota — `FleetRanking`** (card ancho completo, título "Desvío frente al baseline por medidor", subtítulo "media días 8–14 vs perfil horario días 1–7"):

| | |
|---|---|
| Pregunta | ¿Qué medidores exigen mi atención ahora y cuánto se desvían? |
| Forma | Lista de 12 filas: `meter_id` · `StatusBadge` · `VariationBar` (barra CSS centrada en 0, longitud ∝ `|variation_pct|`, escala compartida `max = max |variation_pct|` de la flota) · valor `+110,5 %` en `--ink` tabular · `TypeBadge` + `SeverityBadge` o "—" |
| Orden | `SEVERITY_RANK` asc → `TYPE_ORDER` asc → `|variation_pct|` desc. Resultado: **M-109, M-112, M-104, M-106**, luego los 8 normales. |
| Color de barra | Severidad del medidor (`critical`/`warning`/`neutral` fill); normales `--mark-neutral`. Es la forma **énfasis** del skill: una historia, el resto gris. |
| Por qué la barra no basta para M-112 | Su variación es +0,1 %: barra de 1 px. Lo que lo pone en la fila 2 con badge rojo "Calidad de dato · HIGH" es la severidad. El texto del badge lo explica; la barra dice honestamente "el consumo es normal". |
| Interacción | Fila entera clicable → `/meters/:id`. Hover fila `--surface-2`. Sin tooltip: cada valor está escrito. |
| Vacío (sin run) | Barras en gris, badges "—", banner arriba: "Ejecuta el análisis IA para clasificar los medidores" con CTA. |

**Afordance "Ejecutar análisis IA":** botón primario **en la barra superior del shell** (visible en todas las páginas). Al pulsar: `POST /ai/analyze` → navega a `/analysis`. Mientras `RUNNING`, el botón muta a pill "Analizando · 4/7" con spinner y sigue navegando a `/analysis`. El tile "Último análisis" enlaza al mismo sitio. Una sola fuente de la acción; sin duplicar el botón dentro del dashboard.

Wireframe (1366 px):

```
┌──────┬────────────────────────────────────────────────────────────────────┐
│ ⚡AI  │ Dashboard                          [Decisión: Jev][Expl: LLM] [▶ Ejecutar análisis IA] │
│ Ener.├────────────────────────────────────────────────────────────────────┤
│      │ ┌Medidores┐┌Consumo periodo┐┌Anomalías IA┐┌Prioritarias┐┌Confianza┐┌Último análisis┐ │
│ ▣ Dash│ │ 12      ││ 155.250,8 kWh ││ 4          ││ 2          ││ 91 %    ││ hace 3 min    │ │
│ ▤ Med.│ │8●1▲2⯃   ││01–14/09·11.089││1R·1C·1E·1F ││ requieren… ││▓▓▓▓▓▓░ ││ ● Completado  │ │
│ ⚠ Anom│ └─────────┘└───────────────┘└────────────┘└────────────┘└─────────┘└───────────────┘ │
│ ◔ Anál│ ┌ Desvío frente al baseline por medidor ─────────────────────────────────────────┐ │
│      │ │ M-109 ⯃Crítico      0├████████████████████████ +110,5 %  [siren Real][HIGH]      │ │
│      │ │ M-112 ⯃Crítico      0│ +0,1 %                            [activity Calidad][HIGH]│ │
│      │ │ M-104 ▲Alerta       0├█████████ +47,5 %                  [clip Explicable][MED]  │ │
│      │ │ M-106 ●OK      ██████┤0 -36,8 %                          [minus Falso +][LOW]    │ │
│      │ │ M-102 ●OK           0│ +1,1 %                            —                       │ │
│      │ │ …8 normales, barras grises de 0–2 px…                                             │ │
│      │ └───────────────────────────────────────────────────────────────────────────────────┘ │
└──────┴────────────────────────────────────────────────────────────────────┘
```

> `variation_pct` viene del backend (media días 8–14). Si el backend adopta "último día vs baseline" (§7 riesgos), la vista no cambia: la barra pinta lo que la API da.

### 2.3 Lista de medidores (`/meters`)

**Datos:** `GET /meters?status=&search=&sort=&order=`. Filtros y orden server-side; la única lógica cliente es el desempate por tipo.

`FilterBar` (una fila, encima de la tabla): `SegmentedControl` **Todos · Normal · Alerta · Crítico** (`fieldset` de radios → `status=NORMAL|WARNING|CRITICAL`) · `SearchInput` (`type="search"`, debounce 250 ms → `search=`) · a la derecha, conteo "12 medidores".

`DataTable` columnas:

| Columna | Contenido | Visual inline | Orden (`sort=`) |
|---|---|---|---|
| Medidor | `meter_id` (semibold) + `name` (`--ink-2` 12 px) | texto | `meter_id` |
| Estado | `StatusBadge` | icono + texto + wash | — |
| Consumo (kWh) | `total_consumption_kwh` → `17.526,0` | **texto** tabular, alineado derecha | `consumption` |
| Variación | `variation_pct` → `+110,5 %` | `VariationBar` (mismo componente que el dashboard, `max` = máx. de la página) + texto | `variation` |
| Anomalía IA | `anomaly ? <TypeBadge/> <SeverityBadge/> : '—'` | badges | `severity` |
| | link "Ver detalle →" (`--accent-ink`) | | |

Por qué consumo se queda en texto y variación lleva barra: la variación es la variable de decisión y comparte escala entre filas; el consumo total varía ×2,8 entre medidores por su tamaño, no por su comportamiento, y una barra invitaría a leer "M-104 consume mucho" como problema.

**Orden por severidad (desempate cliente):**

```ts
const bySeverity = (a: MeterRow, b: MeterRow) =>
  (a.anomaly ? SEVERITY_RANK[a.anomaly.severity] : 9) - (b.anomaly ? SEVERITY_RANK[b.anomaly.severity] : 9)
  || (a.anomaly ? TYPE_ORDER.indexOf(a.anomaly.type) : 9) - (b.anomaly ? TYPE_ORDER.indexOf(b.anomaly.type) : 9)
  || Math.abs(b.variation_pct) - Math.abs(a.variation_pct);
```

Resultado: HIGH·REAL (M-109) > HIGH·DATA_QUALITY (M-112) > MEDIUM·EXPLAINABLE (M-104) > LOW·FALSE_POSITIVE (M-106) > normales por |variación|. Cabeceras `<th aria-sort>` con botón; flecha ▲▼ en `--ink-3`.

```
│ Medidores                                                                      12 medidores │
│ [Todos][Normal][Alerta][Crítico]   🔍 Buscar medidor…                                        │
│ Medidor        Estado     Consumo (kWh)  Variación              Anomalía IA               │
│ M-109 Medidor… ⯃ Crítico      17.526,0   0├██████████ +110,5 %  [Real][HIGH]  Ver detalle→ │
│ M-112 Medidor… ⯃ Crítico       9.256,3   0│ +0,1 %              [Calidad][HIGH]           →│
│ M-104 …        ▲ Alerta       18.543,8   0├████ +47,5 %         [Explicable][MEDIUM]      →│
│ M-106 …        ● OK           18.376,4  ██┤0 -36,8 %            [Falso +][LOW]            →│
│ M-101 …        ● OK           10.226,1   0│ -0,1 %              —                         →│
```

### 2.4 Detalle de medidor (`/meters/:id`)

**Datos:** `GET /meters/{id}` · `GET /meters/{id}/readings?resolution=hourly|daily&include_baseline=true` · `GET /meters/{id}/events` · si `anomalies[0]`, `GET /anomalies/{id}` (para `window`).

**Header:** `M-109 · Medidor M-109 · Zona 9` + `StatusBadge` + badges de anomalía con link "Investigar →".

**KPI strip (4 tiles)** — la cifra del PDF ("2.180 vs ~1.070 → +103,7 %") corresponde a *último día vs baseline diario*; con este dataset: **2.207,6 vs 1.048,8 → +110,5 %**. Se calcula del último punto de `resolution=daily&include_baseline=true` (`consumption_kwh`, `baseline_kwh`, `deviation_pct`), no de `variation_pct`:

| Tile | Fuente | Ejemplo M-109 |
|---|---|---|
| Consumo actual (último día) | `daily.points.at(-1).consumption_kwh` | 2.207,6 kWh · sub "14/09" |
| Baseline diario | `daily.points.at(-1).baseline_kwh` | 1.048,8 kWh · sub "mediana días 1–7" |
| Variación | `daily.points.at(-1).deviation_pct` | **+110,5 %** en `--critical-ink` si status CRITICAL, `--warning-ink` si WARNING, `--ink` si no |
| Eléctrico | `stats`: V media / PF medio / PF mín | 219,2 V · PF 0,905 · mín 0,708 |

**Gráfico principal — `MeterChart`** (`ChartFrame` título "Consumo horario", subtítulo "kWh · baseline = mediana por hora del día, 01–07/09"):

| | |
|---|---|
| Pregunta | ¿Cuándo y cuánto se separó el consumo de lo normal, y coincide con algún evento? |
| Componentes | `ComposedChart` → `CartesianGrid` · `XAxis t` · `YAxis domain={[0,'auto']}` · `Area dataKey="band"` (rango `[lo,hi]`, fill `--band`, stroke none) · `Line dataKey="baseline"` (stroke `--baseline`, 2 px) · `Area dataKey="kwh"` fill `--accent-wash` stroke none · `Line dataKey="kwh"` stroke `--accent` 2 px · `ReferenceArea` ventana anómala · `ReferenceLine` por evento · `Tooltip` |
| Series y leyenda | **Real** (línea acento), **Baseline** (línea gris), **Banda ±25 % (umbral de detección)** (rectángulo gris). Leyenda en el header del frame. |
| Eje Y | Desde 0 (tabla §0). Ticks redondos (0 / 25 / 50 / 75 / 100 / 125 kWh). |
| Ventana anómala | `ReferenceArea x1={ms(window.from)} x2={ms(window.to)+3.6e6} fill="var(--<severity>)" fillOpacity={0.12} ifOverflow="extendDomain"` + `label` custom arriba-izquierda: chip `TypeBadge` compacto + `+110 %`. Solo si el medidor tiene anomalía. |
| Evento | `ReferenceLine x={ms(event.timestamp)} stroke="var(--ink)" strokeWidth={1}` + `label` custom en la parte superior: bandera + `event.type` en 11 px `--ink-2` (máx. 1 línea; el `description` va al tooltip y a la tarjeta de eventos). Todos los eventos del medidor, sin distinción de color (el evento no es un tipo de anomalía). |
| Toggle Horario / Diario | `SegmentedControl` en el header del frame. Horario por defecto (el escalón de M-109 ocurre a las **14:00**, invisible en diario). Diario = 14 puntos, misma configuración con `dot={{r:4}}`; la banda pasa a ±25 % del `baseline_kwh` diario. |
| Rango | Chips "Todo · Semana 2 · Ventana anómala" (`from`/`to` de la query). `Brush` **rechazado**: 336 puntos ya son legibles a 1366 px (~3 px por punto) y el brush roba 40 px. |
| Tooltip | `sáb 12/09 14:00` · **110,35 kWh** · Baseline 51,31 kWh · Desvío **+115,1 %** (en `--critical-ink` si |desvío| ≥ 25 %) · si la hora está en la ventana: fila "Dentro de la ventana anómala". |
| aria-label | "Consumo horario de M-109 del 01/09 al 14/09. Desde el 12/09 14:00 el consumo está un 110 % por encima del baseline durante 58 horas. Evento UNKNOWN el 12/09 14:00." (construido de `AnomalyDetail` si existe; si no, "Consumo dentro de la banda normal en todo el periodo.") |

Cómo se leen los 4 casos aquí: **M-109** línea azul salta fuera de la banda a las 14:00 del 12/09 y se queda arriba (58 h) con el sombreado rojo y la bandera "UNKNOWN" exactamente en el borde izquierdo del sombreado. **M-104** salta a +46 % el 11/09 00:00 con bandera "OPERATIONAL_CHANGE" en el mismo x, sombreado ámbar. **M-106** cae casi a cero 12 h el 08/09 (sombreado pizarra, bandera "SCHEDULED_OUTAGE") y vuelve dentro de la banda. **M-112** nunca sale de la banda: no hay sombreado en este gráfico (su ventana se sombrea en los eléctricos, abajo).

**Variables eléctricas — `ElectricalCharts`** (bloque bajo el principal; título "Tensión, corriente y factor de potencia"; leyenda compartida "Real · Baseline"; tres `ComposedChart` de 120 px con `syncId="meter"` y **márgenes idénticos** al principal para que los ejes X alineen píxel a píxel; solo el último pinta ticks del eje X):

| Gráfico | Eje Y | Referencias | Qué hace visible |
|---|---|---|---|
| Tensión (V) | `domain={[Math.floor(min)-3, Math.ceil(max)+3]}` — **no parte de cero**, etiqueta "eje acotado" en el subtítulo | `ReferenceLine y={220}` (`--axis`, label "220 V nominal") · `ReferenceArea y1={231} y2={top}` y `ReferenceArea y1={bottom} y2={209}` fill `--critical` 8 % (zonas fuera de ±5 %) · `Line baseline_v` (`--baseline`) · `Line voltage_v` (`--ink-2`, 1,5 px) | **M-112**: desde el 13/09 00:00 el trazo se convierte en un diente de sierra que entra en la zona roja cada 3 h (241 → 216 → 220 → 240 → 219 → 224 → 203 …); sobre un rango de ~45 V, un salto de 20 V es ~45 % de la altura. **M-109**: baja 3 V pero queda dentro de la banda → correctamente "no es problema de tensión". |
| Corriente (A) | Desde 0 | `Line baseline_i` · `Line current_a` | M-109 ×2,1 y M-104 ×1,47 se leen como la misma forma que el kWh (consistencia física); M-106 cae a ~48 A. |
| Factor de potencia | `domain={[0.5, 1]}` fijo | `ReferenceLine y={0.8}` label "0,80" · `ReferenceArea y1={0.5} y2={0.8}` fill `--critical` 8 % ("zona PF bajo") · `Line baseline_pf` · `Line power_factor` | **M-109**: escalón limpio 0,94 → 0,74 a las 14:00 del 12/09 que entra en la zona roja y se queda (58 h). **M-112**: caídas puntuales a 0,58–0,72 cada 3 h desde el 13/09. |

La `ReferenceArea` de la ventana anómala se replica en los tres con las mismas x, así el ojo conecta las cuatro filas. Para M-112 la ventana es `13/09 00:00 → 14/09 23:00` (48 h) y solo aquí se ve el sombreado: el lector entiende "consumo normal, lecturas rotas" sin texto.

Por qué small multiples y no un gráfico normalizado: PF cae −21 % y V sube +9 % en M-112; en un eje común "% vs baseline" ambos serían legibles, pero perderíamos los absolutos que el técnico necesita (241 V, 0,58) y la relación con los umbrales (209–231, 0,80). Por qué no dual-axis: dos escalas deslizables inventan correlación; aquí hay cuatro variables, no dos.

```
│ M-109 · Medidor M-109 · Zona 9   ⯃ Crítico   [siren Anomalía real][HIGH]  Investigar → │
│ ┌Consumo actual┐┌Baseline diario┐┌Variación ┐┌Eléctrico             ┐                   │
│ │ 2.207,6 kWh  ││ 1.048,8 kWh   ││ +110,5 % ││ 219,2 V · PF 0,905   │                   │
│ ┌ Consumo horario     ─Real ─Baseline ▒Banda ±25 %   [Horario|Diario] [Todo|Sem 2|Ventana]┐│
│ │125┤                                          🏳UNKNOWN▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒     ││
│ │100┤                                              ╭╮▒╭╮▒▒▒╭╮▒▒▒▒╭╮▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒      ││
│ │ 75┤                                             ╭╯ ╰╯ ╰──╯ ╰────╯ ╰─                    ││
│ │ 50┤╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭─╮ ╭╯┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ baseline           ││
│ │ 25┤╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯ ╰─╯                                          ││
│ │  0└──┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬──               ││
│ │    01/09 02   03   04   05   06   07   08   09   10   11   12   13   14                ││
│ ├ Tensión (V) · eje acotado ────────────────────────────────────────────────────────────┤│
│ │231┤░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ││
│ │220┤────────────────────────────────────────────────────~~~~~~~~~~~~~~~~~~~~~~~ (-3 V)   ││
│ │209┤░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ││
│ ├ Corriente (A) ────────────────────────────────────────────────────────────────────────┤│
│ │500┤                                              ╭──╮ ╭──╮ ╭──╮                        ││
│ │  0┤╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╮╭─╯  ╰─╯  ╰─╯                                       ││
│ ├ Factor de potencia ───────────────────────────────────────────────────────────────────┤│
│ │1,0┤────────────────────────────────────────────────╮                                   ││
│ │0,8┤┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╰───────────────────── 0,74        ││
│ │0,5┤░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ││
```

### 2.5 Anomalías IA (`/anomalies`)

**Datos:** `GET /anomalies?severity=&type=&priority=&sort=` (default `rank asc`).

`FilterBar`: `SegmentedControl` severidad (Todas · HIGH · MEDIUM · LOW) · `select` tipo (4 + Todos) · `checkbox` "Solo prioritarias" · derecha: "4 anomalías · run 14/09 10:32".

`DataTable`:

| Columna | Contenido | Visual |
|---|---|---|
| # | `rank` | `--ink-3` |
| Medidor | `meter_id` + `meter_name` | link a `/meters/:id` |
| Tipo | `TypeBadge` | icono + texto + wash |
| Severidad | `SeverityBadge` (+ icono bandera `--critical-ink` si `priority`) | |
| Confianza | `ConfidenceBar`: **96 %** (tabular) + `HBar` 64×6 px fill `--ink-2` sobre track `--grid` | nunca color por valor: la confianza no es un estado |
| Hallazgo | `reason` en 1 línea (`line-clamp-1`, `title` = texto completo) | `--ink-2` 13 px |
| Estado | chip OPEN / ACKNOWLEDGED / RESOLVED (`neutral` / `warning` / `ok` wash) | |
| Acción | botón secundario "Investigar →" → `/anomalies/:id` | |

Fila con `priority` lleva un borde izquierdo de 3 px `--critical`. Filas 40 px.

```
│ Anomalías IA                                             4 anomalías · run hace 3 min │
│ [Todas][HIGH][MEDIUM][LOW]  Tipo ▾  ☐ Solo prioritarias                              │
│ #  Medidor   Tipo             Severidad   Confianza   Hallazgo                Estado  │
│▌1  M-109     [siren Real]     [HIGH] ⚑    96 % ▓▓▓▓▓▓░ Consumo 110,3 % por en… OPEN  Investigar→│
│▌2  M-112     [activity Calid] [HIGH] ⚑    95 % ▓▓▓▓▓▓░ Lecturas inconsistente… OPEN  Investigar→│
│ 3  M-104     [clip Explicab]  [MEDIUM]    85 % ▓▓▓▓▓░░ Consumo 46,4 % por enc… OPEN  Investigar→│
│ 4  M-106     [minus Falso +]  [LOW]       90 % ▓▓▓▓▓▓░ Caída del 79,9 % dura… OPEN  Investigar→│
```

### 2.6 Investigación (`/anomalies/:id`)

**Datos:** `GET /anomalies/{id}` (trae `evidence`, `events_matched`, `ai_meta`, `window`) · `GET /meters/{meter}/readings?...&include_baseline=true` (rango = ventana ± 48 h, horario) · `GET /meters/{meter}/events`.

Layout 2 columnas: principal 8/12, rail 4/12 (a tablet, rail debajo).

**Columna principal:**

| Bloque | Contenido | Componente |
|---|---|---|
| Header | `M-109 · Medidor M-109` · `TypeBadge` · `SeverityBadge` · "Prioritaria" · `ConfidenceBar` grande (**96 %**, barra 120 px) · `ProviderBadge`×2 | — |
| Qué encontró la IA | `reason` a 16 px `--ink`, ancho máx. 72 ch. Debajo: "Ventana: 12/09 14:00 → 14/09 23:00 · 58 h" | `Prose` (texto plano) |
| Gráfico | `MeterChart` con `focus={window}` (rango ventana ± 48 h, sombreado + bandera de evento) + `ElectricalCharts` (los tres, siempre: la ausencia de cambio en V/PF **es** evidencia para M-104 y M-106) | reutilizados |
| Evidencia | Lista ordenada: primero `weight=primary`, luego `supporting`. Cada ítem: icono por `kind` (tabla abajo) · tag "Principal"/"Apoyo" (`neutral` wash) · `text_es` · a la derecha, par **observado → esperado** con `unit` y `deviation_pct` con signo (`+110,3 %` en `--ink` semibold; sin color: el color ya lo lleva la severidad del caso) · para kinds DQ, `share_pct` como "19 % de las horas" | `EvidenceList` |
| Antes / después | Tabla 4 filas máx. construida de los kinds `CONSUMPTION_DEVIATION`, `VOLTAGE_SAG`, `POWER_FACTOR_DROP`, `CURRENT_CHANGE` (o de `LOW_POWER_FACTOR`/`VOLTAGE_OUT_OF_BAND` en DQ): Variable · Baseline (`expected`) · Ventana (`observed`) · Δ (`deviation_pct` o diferencia absoluta con unidad) · flecha ↑↓ en `--ink-3`. Si una variable no tiene evidencia se muestra "sin cambio" en `--ink-3` (dato honesto, no fila vacía). | `BeforeAfterTable` |

Iconos por `Evidence.kind`: `CONSUMPTION_DEVIATION` `trending-up`/`trending-down` según signo · `VOLTAGE_*`, `VOLTAGE_SAG` `zap` · `POWER_FACTOR_DROP`, `LOW_POWER_FACTOR` `gauge` (icono, no gráfico) · `CURRENT_CHANGE` `activity` · `POWER_RESIDUAL_ERRATIC` `shuffle` · `EVENT_*`, `NO_EXPLAINING_EVENT`, `DURATION_MATCH` `flag`. (Suma 6 paths más al `Icon.tsx`: 14 en total, sigue sin librería.)

**Rail derecho:**

| Card | Contenido |
|---|---|
| Decisión de la IA | `ProbBars`: 4 filas en `TYPE_ORDER` fijo, cada una `TypeBadge` compacto + `HBar` (fill = tono del tipo, track `--grid`) + `91 %` tabular; la fila ganadora lleva ✓ en `--ink`. Si `decision_probabilities === null`: texto "Decidido por reglas — sin distribución de probabilidad" (no se fabrica). Debajo, colapsado (`<details>`): severidad (3 barras `SEVERITY_RANK`) y "Prioridad: 88 %". |
| Proveedores | `ProviderBadge` "Decisión · Jev" / "Explicación · LLM (nemotron-3-super)". Si `fallback_notes` no vacío: variante ámbar con icono `triangle-alert` y `title` con las notas ("jev:timeout → reglas"). `latency_ms` en el `title`. Un solo componente, dos instancias. |
| Eventos relacionados | `EventsTimeline`: lista vertical con línea hairline; por evento: `dd/MM HH:mm` · chip `event.type` (neutral wash) · `description` · relación en texto: **"Explica la desviación"** (✓ `--ok-ink`) / **"No explica nada"** (`--ink-2`, caso UNKNOWN de M-109) / **"Corrobora la calidad de dato"** · "lag 0 h respecto al inicio". Vacío: "Sin eventos registrados para este medidor en ±24 h". |
| Acción recomendada | `recommended_action` 15 px · botones: **"Marcar en revisión"** (→ `PATCH status=ACKNOWLEDGED`) · **"Resolver"** (→ `RESOLVED`) · si ya no está OPEN, "Reabrir". Estado actual como chip. Optimistic update; error → toast y revert. |

```
│ ← Anomalías   M-109 · Medidor M-109   [siren Anomalía real][HIGH] ⚑ Prioritaria   96 % ▓▓▓▓▓▓▓░  [Decisión·Jev][Expl·LLM] │
│ ┌ Qué encontró la IA ─────────────────────────────────────┐ ┌ Decisión de la IA ─────────────┐ │
│ │ Consumo 110,3 % por encima del baseline durante 58 h    │ │ [Real]       ▓▓▓▓▓▓▓▓▓░ 91 % ✓ │ │
│ │ sin evento operativo conocido; el PF cae de 0,94 a 0,73.│ │ [Calidad]    ▓░░░░░░░░░  5 %   │ │
│ │ Ventana 12/09 14:00 → 14/09 23:00 · 58 h                │ │ [Explicable] ░░░░░░░░░░  3 %   │ │
│ ├ Gráfico (ventana ±48 h, sombreado rojo, 🏳UNKNOWN) ─────┤ │ [Falso +]    ░░░░░░░░░░  1 %   │ │
│ │ …MeterChart + V / I / PF…                               │ │ ▸ Severidad y prioridad        │ │
│ ├ Evidencia ──────────────────────────────────────────────┤ ├ Eventos relacionados ──────────┤ │
│ │ ↗ Principal  Consumo medio 110,3 % superior… 2.200→1.050 kWh/día  +110,3 % │ │ ● 12/09 14:00 [UNKNOWN]        │ │
│ │ ◎ Apoyo      PF medio 0,73 vs 0,94 (mín 0,71)           0,73→0,94   -0,21   │ │   "No operational event…"      │ │
│ │ ⚡ Apoyo      Tensión media 216,4 V vs 220,0 V           216,4→220,0 -3,6 V  │ │   No explica nada · lag 0 h    │ │
│ │ ~ Apoyo      Corriente 320 A vs 150 A                    320→150 A   ×2,1    │ ├ Acción recomendada ────────────┤ │
│ │ ⚑ Principal  Ningún evento operativo explica…                                │ │ Investigar el medidor y la     │ │
│ ├ Antes / después ────────────────────────────────────────┤ │ instalación: verificar…        │ │
│ │ Variable   Baseline   Ventana   Δ                       │ │ [Marcar en revisión] [Resolver]│ │
│ │ Consumo    1.048,8    2.200,6   +110,3 % ↑              │ │ Estado: OPEN                   │ │
│ │ Tensión    220,0 V    216,4 V   -3,6 V ↓                │ └────────────────────────────────┘ │
│ │ PF         0,94       0,73      -0,21 ↓                 │                                     │
│ │ Corriente  150 A      320 A     ×2,1 ↑                  │                                     │
```

### 2.7 Ejecutar análisis IA (`/analysis`)

**Datos:** al montar, `GET /ai/analysis?limit=1`; si hay run `QUEUED|RUNNING`, retomar polling `GET /ai/analysis/{id}` cada 700 ms. Botón → `POST /ai/analyze` (idempotente; `reused=true` simplemente sigue el run activo).

Header: título "Análisis IA" · `ProviderBadge`×2 desde `run.providers` · botón primario "Ejecutar análisis IA" (`disabled` + spinner + "Analizando…" mientras activo) · a la derecha "Iniciado 10:32:14".

`AnalysisStepper` (vertical, 7 filas, línea hairline conectando glifos):

| Estado etapa | Glifo (20 px) | Label | Detail | Duración |
|---|---|---|---|---|
| `pending` | ○ `--axis` | `--ink-3` | — | — |
| `running` | ◐ spinner `--accent` (`animation: spin 1s linear`; con `prefers-reduced-motion`: ◐ estático + texto "en curso") | `--ink` semibold | skeleton de 1 línea 60 % | contador vivo `1,2 s` |
| `done` | ● con check, `--ok` | `--ink` | `detail` en `--ink-2` | `finished_at − started_at` → `0,8 s` `--ink-3` tabular |
| `failed` | ✕ `--critical` | `--critical-ink` | `run.error.message` en `--critical-ink` + botón "Reintentar" | — |

`detail` esperado por etapa (los 5 primeros los fija ARCHITECTURE §4.4; 6 y 7 se recomiendan al backend):

| # | Label | detail |
|---|---|---|
| 1 | Lecturas | `4.032 lecturas · 12 medidores · 14 días` |
| 2 | Baseline | `Perfil horario de 7 días para 12 medidores` |
| 3 | Detección | `3 segmentos de consumo · 1 medidor con señales de calidad de dato` |
| 4 | Correlación | `Contexto eléctrico calculado para 4 candidatos` |
| 5 | Eventos | `2 eventos explican · 1 reportado sin explicación · 1 de calidad de dato` |
| 6 | Explicación | `4 decisiones (Jev 4 · reglas 0) · 4 explicaciones (LLM 4 · plantilla 0)` — si hubo fallback: `Jev 3 · reglas 1 (timeout)` y el glifo pasa a ● con punto ámbar: **done pero degradado** |
| 7 | Recomendación | `4 anomalías priorizadas · M-109 primera` |

Al `COMPLETED`, encima del stepper aparece `RunHeadline`: card con el `summary.headline` como **hero figure** (28 px semibold, único por vista): "**4 anomalías detectadas** · 2 requieren atención prioritaria", debajo 3 mini-contadores por severidad (`by_severity`) con `SeverityBadge` y `avg_confidence` "confianza media 91 %", y CTA primario "Ver anomalías →" (`/anomalies`) + secundario "Ver M-109" (primer rank). Aparece con fade de 200 ms (sin fade en reduced-motion).

Al `FAILED`: banner `--critical-wash` con `error.code` + `message` ("TIMEOUT · El análisis superó 120 s") y "Reintentar"; texto bajo el banner: "Las anomalías del análisis anterior siguen vigentes."

```
│ Análisis IA                    [Decisión·Jev][Explicación·LLM]      [◐ Analizando…]  Iniciado 10:32:14 │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ● Lecturas        4.032 lecturas · 12 medidores · 14 días                      0,3 s │ │
│ │ │                                                                                      │ │
│ │ ● Baseline        Perfil horario de 7 días para 12 medidores                   0,1 s │ │
│ │ ● Detección       3 segmentos de consumo · 1 medidor con señales de calidad     0,2 s │ │
│ │ ● Correlación     Contexto eléctrico calculado para 4 candidatos               0,1 s │ │
│ │ ● Eventos         2 eventos explican · 1 reportado sin explicación · 1 DQ      0,0 s │ │
│ │ ◐ Explicación     ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                                     2,4 s │ │
│ │ ○ Recomendación                                                                       │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
│ (al completar, arriba:)                                                                    │
│ ┌ 4 anomalías detectadas · 2 requieren atención prioritaria ──────────────────────────┐ │
│ │ [HIGH] 2   [MEDIUM] 1   [LOW] 1   · confianza media 91 %      [Ver anomalías →] [Ver M-109] │
```

---

## 3. Layout y sistema

**App shell:** sidebar izquierda 220 px (`--surface`, hairline derecha) con logo, 4 destinos (Dashboard · Medidores · Anomalías IA · Análisis IA) con icono + texto, badge numérico rojo en "Anomalías IA" = `priority`. Colapsa a 56 px (solo iconos, `title`) por debajo de 1200 px; en < 900 px se convierte en drawer. Barra superior 56 px: título de página (20 px) + breadcrumb, a la derecha `ProviderBadge`×2 (modo IA de `/health` o `dashboard.ai_mode`), botón primario "Ejecutar análisis IA", avatar "Operador demo" con menú (tema claro/oscuro/sistema, salir).

**Grid de página:** contenido `max-width: 1440px`, padding 24 px (16 px en tablet), grid 12 columnas gap 16 px. A 1366×768: KPI 6 col × 1 fila (cada tile ~200 px), gráfico principal 320 px + 3×120 px eléctricos = la pantalla de detalle requiere scroll de una pantalla, aceptable; el hallazgo (KPI + gráfico principal) entra sin scroll.

**Tipografía (system sans, 3 tamaños + 1 display):**

| Token | Tamaño / line-height | Uso |
|---|---|---|
| `text-xs` | 12 / 16 | labels de KPI, ticks de ejes, badges, meta |
| `text-sm` | 13 / 20 | cuerpo, tablas, tooltips (`tabular-nums` **solo** en celdas numéricas y ticks) |
| `text-lg` | 20 / 28 | título de página, título de card |
| `display` | 28 / 32 semibold | valor de KPI, headline del run (figuras proporcionales) |

**Densidad y espaciado:** escala 4 / 8 / 12 / 16 / 24 / 32. Card padding 16, gap entre cards 16, filas de tabla 40 px, badges 22 px alto / 6 px radio / 12 px texto, radio de card 8 px, sombra ninguna (hairlines). Botón primario: `--accent` fondo + blanco (4,4:1 light; sobre `#1c5cab` 6,6:1 — usar `--accent-ink` como fondo del botón en light si se quiere AA en 13 px, o texto a 14 px semibold).

**Calma:** tinta oscura sobre claro, un acento, semánticos solo en badges, barras de estado, sombreados y el valor "Variación". Ningún gradiente, sombra, 3D, ni fondo de color en cards.

---

## 4. Data shaping (API → Recharts / CSS)

Utilidades en `src/lib/fmt.ts` y `src/lib/shape.ts`. Timestamps son ISO **naive** (`"2026-09-12T14:00:00"`): nunca `new Date(iso)` directo (Safari/Chrome difieren). Parsear por partes:

```ts
export const parseNaive = (s: string) => { const [d, t = '00:00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi).getTime(); };
export const hourOf = (s: string) => Number(s.slice(11, 13));            // sin Date: sin riesgo TZ
const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });  // 1.234,5
const pf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
export const fmtKwh = (v: number) => `${nf.format(v)} kWh`;
export const fmtPct = (v: number) => `${pf.format(v)} %`;                 // "+110,5 %"
export const fmtPF  = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const df = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtTs = (ms: number) => df.format(ms).replace(',', '');      // "sáb 12/09 14:00"
export const fmtDay = (ms: number) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit' }).format(ms); // "12/09"
```

### 4.1 `MeterChart` — de `GET /meters/{id}/readings?include_baseline=true` a `ChartPoint[]`

```ts
type ChartPoint = { t: number; kwh: number; baseline: number; band: [number, number]; dev: number; v: number; i: number; pf: number; baseline_v?: number; baseline_i?: number; baseline_pf?: number };
const BAND = 0.25; // umbral del detector (ARCHITECTURE §6.2)

export function toChartPoints(r: ReadingsResponse, profile?: MeterDetail['baseline']['hourly']): ChartPoint[] {
  const byHour = profile && Object.fromEntries(profile.map(h => [h.hour, h]));
  return r.points.map(p => {
    const b = p.baseline_kwh ?? byHour?.[hourOf(p.timestamp)]?.kwh ?? NaN;   // API primero; fallback perfil por hora-del-día
    const h = byHour?.[hourOf(p.timestamp)];
    return { t: parseNaive(p.timestamp), kwh: p.consumption_kwh, baseline: b, band: [b * (1 - BAND), b * (1 + BAND)],
      dev: p.deviation_pct ?? ((p.consumption_kwh - b) / b) * 100, v: p.voltage_v, i: p.current_a, pf: p.power_factor,
      baseline_v: h?.voltage_v, baseline_i: h?.current_a, baseline_pf: h?.power_factor };
  });
}
export const dayTicks = (pts: ChartPoint[]) => pts.filter(p => new Date(p.t).getHours() === 0).map(p => p.t); // un tick por día a las 00:00
```

- **Alineación baseline por hora del día:** `include_baseline=true` ya devuelve `baseline_kwh` por punto (mediana de esa hora en días 1–7). El fallback `byHour[hourOf(ts)]` se usa solo si falta; para V/I/PF el perfil `MeterDetail.baseline.hourly` es la única fuente (`voltage_v`, `power_factor`; si el backend añade `current_a` al perfil se pinta, si no la línea baseline de corriente se omite y la leyenda lo dice).
- **Daily:** mismos campos; `baseline_kwh` diario viene sumado por la API; banda = ±25 % de ese valor; `dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}` (anillo de superficie).
- **Downsampling: ninguno.** 336 puntos × 4 series × 4 gráficos ≈ 5.400 vértices en 4 `<path>`; SVG lo pinta en < 5 ms. Regla: activar LTTB solo si un medidor superara ~5.000 puntos (no ocurre en este producto).
- **Eje Y kWh:** `domain={[0, (max: number) => Math.ceil(max / 25) * 25]}`.
- **Dominio V:** `[Math.floor(min(v)) - 3, Math.ceil(max(v)) + 3]` calculado de los puntos; asegurar que incluya 209 y 231 (`Math.min(…, 205)`, `Math.max(…, 235)`) para que las zonas siempre se vean.

### 4.2 Ventana anómala y eventos

```ts
const HOUR = 3_600_000;
export const segmentBounds = (a: AnomalyDetail) => ({ x1: parseNaive(a.window.from), x2: parseNaive(a.window.to) + HOUR }); // el punto 23:00 cubre 23:00–24:00
// Fallback si solo hay evidencia: primer Evidence con weight 'primary' → window_from / window_to.
export const eventMarks = (evs: Event[]) => evs.map(e => ({ x: parseNaive(e.timestamp), type: e.type, description: e.description }));
```

Render: `<ReferenceArea x1={x1} x2={x2} fill={`var(--${SEVERITY[a.severity]})`} fillOpacity={0.12} ifOverflow="extendDomain" label={<SegmentLabel .../>} />` y `<ReferenceLine x={x} stroke="var(--ink)" label={<EventFlag type={type}/>} />`. Para M-112 la `AnomalyDetail.window` es `13/09 00:00 → 14/09 23:00`: el sombreado va en los cuatro gráficos aunque en kWh no haya desvío (es el mensaje).

### 4.3 `FleetRanking` / `VariationBar` — de `GET /meters` a filas

```ts
const rows = [...meters.items].sort(bySeverity);                      // §2.3
const max = Math.max(1, ...rows.map(r => Math.abs(r.variation_pct)));  // escala compartida
// VariationBar: track 160 px con cero al 50 %; ancho = |v|/max * 80 px; left = v>=0 ? 50% : 50% - ancho; fill = anomaly ? var(--<SEVERITY[sev]>) : var(--mark-neutral)
```

Sin Recharts: son 12 filas, cada una etiquetada con su valor; el eje está implícito (marca de cero de 1 px `--axis` y el `max` impreso en la cabecera de la columna: "escala ±110 %").

### 4.4 `ProbBars` / `ConfidenceBar`

```ts
const probs = TYPE_ORDER.map(t => ({ type: t, p: (ai_meta.decision_probabilities?.[t] ?? 0) * 100 })); // orden fijo, nunca sort
// HBar: width = p % del track; fill var(--<TYPE[t].tone>); texto `${Math.round(p)} %`; ganador = type === anomaly.type (✓)
// ConfidenceBar: HBar con p = confidence*100, fill var(--ink-2)
```

Si `decision_probabilities` es `null` → no renderizar barras (mensaje de §2.6).

### 4.5 `AnalysisStepper`

```ts
const dur = (s: StageProgress) => s.started_at && s.finished_at ? (parseNaive(s.finished_at) - parseNaive(s.started_at)) / 1000 : null; // "0,8 s"
const degraded = (run: AnalysisRun, anomalies?: AnomalySummary[]) => anomalies?.some(a => a.providers.decision === 'rules' && run.providers.decision === 'jev') // punto ámbar en etapa 6
```

Polling: `setInterval(700)` mientras `status ∈ {QUEUED, RUNNING}`; al pasar a `COMPLETED`, invalidar dashboard/meters/anomalies (refetch) y mostrar `RunHeadline`.

---

## 5. Checklist de accesibilidad y honestidad

| # | Regla | Cómo se cumple |
|---|---|---|
| 1 | Color nunca único portador | Todo badge = icono + texto. Barras de flota llevan valor impreso. Ventana anómala lleva etiqueta de tipo. Zonas rojas de V/PF llevan `ReferenceLine` con etiqueta numérica (209/231/0,80). |
| 2 | Contraste | Tintas de texto ≥ 4,5:1 (tabla §1.3; peor: `--warning-ink` light 5,8:1 sobre surface, 4,3:1 sobre su wash). Marks ≥ 3:1 salvo aguamarina light 2,7:1 → nunca como mark de gráfico, solo en badges con texto. `--ink-3` (3,5:1) solo para ticks y meta ≥ 12 px, nunca para datos. |
| 3 | CVD | Tipos validados all-pairs en ambos modos (ΔE ≥ 9,2). Rojo/verde de status nunca adyacentes en un gráfico (normales en gris). Iconos distintos por rol (check / triángulo / octágono / menos). |
| 4 | Teclado | Tablas: cabeceras `<button>` con `aria-sort`; filas con link explícito (no `onClick` en `<tr>` sin foco: la fila entera es un `<a>` estirado). Filtros: `fieldset` de radios (segmented) + `input type=search`. Recharts `accessibilityLayer` (default) → ← → recorre puntos y anuncia el tooltip. Botones de acción con `aria-busy` durante el PATCH. |
| 5 | Lector de pantalla | Cada `ChartFrame` = `<figure role="figure" aria-labelledby>` con `<figcaption>` visible (título+subtítulo) y `aria-description` = resumen del hallazgo (§2.4). Botón "Ver tabla" abre `<table>` con los mismos datos (timestamp, kWh, baseline, desvío, V, I, PF). Stepper = `<ol aria-live="polite">`; cambios de etapa se anuncian. |
| 6 | Ejes honestos | Barras (`VariationBar`, `HBar`) desde cero. kWh e I desde cero. V acotado y **declarado** en subtítulo ("eje acotado 205–245 V"). PF fijo 0,5–1,0 (declarado). Nunca `domain={['auto','auto']}` en kWh. |
| 7 | Sin eje dual | Cuatro gráficos apilados con `syncId`. |
| 8 | Formato de tiempo | Eje: `dd/MM` en el tick de 00:00 de cada día. Tooltip y tablas: `sáb 12/09 14:00`. Nunca ISO crudo en UI. |
| 9 | Formato numérico | `es-CO`: `1.234,5 kWh`, `+110,5 %`, `0,74` (PF dos decimales), `216,4 V`, `320 A` (sin decimales). `tabular-nums` solo en columnas y ticks. |
| 10 | Movimiento | Sin animación de series. Spinner y fade respetan `prefers-reduced-motion`. |
| 11 | Estados | Loading primera carga: skeleton de altura exacta. Refetch: render previo a 50 % opacidad. Vacío/error con texto y acción. Nunca layout jump. |
| 12 | Texto no confiable | `reason`, `recommended_action`, `description`, `detail` se renderizan como texto React (nunca `dangerouslySetInnerHTML`). `line-clamp` para longitudes variables del LLM. |
| 13 | Tema oscuro | Tokens redefinidos bajo `prefers-color-scheme: dark` **y** `[data-theme="dark"]`; toggle en el menú de usuario persiste en `localStorage` (try/catch). Marks dark validados contra `#1a1a19` (§1.2). |

---

## 6. Inventario de componentes (17)

| Componente | Props clave | Pantallas | Notas |
|---|---|---|---|
| `AppShell` | `children` | todas | Sidebar + Topbar (con `RunButton` y `ProviderBadge`×2). Sidebar colapsable. |
| `Icon` | `name: IconName; size?` | todas | 14 paths SVG inline (Lucide): circle-check, triangle-alert, octagon-alert, circle-minus, siren, activity, clipboard-check, trending-up, trending-down, zap, gauge, shuffle, flag, search. |
| `Badge` | `tone: Tone; icon: IconName; children; compact?` | todas | Primitivo. `StatusBadge`, `SeverityBadge`, `TypeBadge` son 3 wrappers de 3 líneas que mapean con `semantics.ts`. |
| `ProviderBadge` | `kind:'decision'\|'explanation'; provider: string; notes?: string[]; latencyMs?` | dashboard, anomalías, investigación, análisis | Variante ámbar si `notes.length`. `title` con notas/latencia. |
| `KpiTile` | `label; value: string; sub?: ReactNode; tone?: Tone; action?` | dashboard | Valor display 28 px. |
| `HBar` | `value: number (0–100); fill: string; label?: string; width?` | dashboard, anomalías, investigación | Barra CSS 6 px. Base de `ConfidenceBar` y `ProbBars`. |
| `VariationBar` | `value: number; max: number; tone: Tone \| 'neutral-mark'` | dashboard, medidores | Barra centrada en cero, CSS. |
| `FleetRanking` | `rows: MeterRow[]` | dashboard | Lista ordenada por `bySeverity`; usa `VariationBar` + badges. |
| `FilterBar` | `children` (compone `SegmentedControl`, `SearchInput`, `Select`, `Checkbox`) | medidores, anomalías | Una fila, encima de la tabla. |
| `DataTable<T>` | `columns: Col<T>[]; rows: T[]; sort; onSort; rowHref?` | medidores, anomalías | Cabeceras `aria-sort`, filas 40 px, `line-clamp` opcional por columna. |
| `ChartFrame` | `title; subtitle; legend: {label, swatch:'line'\|'rect', color}[]; controls?: ReactNode; ariaDescription; tableRows?; state:'loading'\|'ready'\|'empty'\|'error'` | detalle, investigación | Header + estados + botón "Ver tabla". |
| `MeterChart` | `points: ChartPoint[]; resolution; segment?: {x1,x2,severity,type,pct}; events: EventMark[]; height?` | detalle, investigación | `ComposedChart` §2.4. |
| `ElectricalCharts` | `points: ChartPoint[]; segment?; events; syncId` | detalle, investigación | Tres `ComposedChart` (V, I, PF) con zonas y referencias. |
| `ChartTooltip` | Recharts `TooltipProps` | detalle, investigación | Valores primero, keys de línea, resalta desvío ≥ 25 %. |
| `EvidenceList` | `items: Evidence[]` | investigación | Icono por `kind`, tag peso, observado→esperado. |
| `BeforeAfterTable` | `items: Evidence[]` | investigación | 4 filas máx., "sin cambio" cuando falta. |
| `EventsTimeline` | `events: EventRef[]; anchor: string` | investigación | Relación textual + lag. |
| `ProbBars` | `probs: Record<string,number> \| null; winner: AnomalyType` | investigación | Orden fijo `TYPE_ORDER`; mensaje si `null`. |
| `AnalysisStepper` | `run: AnalysisRun; degraded?: boolean` | análisis | `<ol aria-live>`; + `RunHeadline` (`summary`) y `RunError` internos. |

(19 nombres, 17 ficheros: `StatusBadge/SeverityBadge/TypeBadge` viven en `Badge.tsx`; `RunHeadline`/`RunError` en `AnalysisStepper.tsx`.) Páginas: `Login`, `Dashboard`, `Meters`, `MeterDetail`, `Anomalies`, `Investigation`, `Analysis` — componen lo anterior; sin lógica de datos propia salvo `useQuery`-style hooks en `src/api/` (fetch + `useEffect`; no se añade react-query: 8 endpoints, un cliente de 60 líneas basta).

---

## 7. Riesgos y preguntas abiertas

| # | Riesgo | Mitigación / decisión |
|---|---|---|
| 1 | **Definición de `variation_pct`**: el PDF cita +103,7 % (último día vs baseline); ARCHITECTURE la define como media días 8–14 (≈ +39 … +69 % para M-109). La flota y la lista pintan lo que devuelve la API; el detalle **calcula último día vs baseline** de `readings?resolution=daily` (+110,5 %). Dos cifras distintas para el mismo medidor en pantallas distintas. | Alinear con backend: recomendar que `variation_pct` = último día vs baseline diario (la que reproduce el PDF, DATA_ANALYSIS §3.1). Si no, etiquetar el KPI de flota "media días 8–14" y el del detalle "último día". |
| 2 | M-106 tiene `variation_pct` ≈ −5 % y status `NORMAL` (FALSE_POSITIVE → NORMAL según §3.2): en la flota queda en fila 4 con barra corta gris-pizarra. Correcto (no requiere acción) pero un evaluador puede buscar "el −80 %". | El badge "Falso positivo · LOW" y el detalle con sombreado del 08/09 lo cuentan. No inflar la barra con el pico del segmento: sería mezclar dos definiciones en una columna. |
| 3 | `MeterDetail.baseline.hourly` no incluye `current_a` en el contrato. | La línea baseline de corriente se omite si falta; pedir al backend añadir `current_a` al perfil (una columna más del mismo `groupby`). |
| 4 | El total de consumo del ejemplo de ARCHITECTURE (145.203,8) no coincide con DATA_ANALYSIS (155.250,8). | La UI muestra el valor de la API; el test de backend fija la cifra. Anotado para que no se hardcodee en el frontend. |
| 5 | Timestamps naive + `Date` en navegadores → desplazamientos de hora en el eje. | `parseNaive` por partes y `hourOf` por slice. Nunca `new Date(iso)`. |
| 6 | Recharts 3: `ReferenceArea` con eje X `type="number"` exige que `x1/x2` sean números del mismo dominio; con `type="category"` las áreas se pegan al índice y los eventos "entre puntos" se pierden. | Eje X siempre numérico (`scale="time"`). Verificar en el primer render que la bandera de M-109 cae a las 14:00 y no a las 00:00. |
| 7 | `syncId` sincroniza tooltips por índice de dato: los 4 gráficos deben recibir **el mismo array** (mismo largo y orden). | `ElectricalCharts` y `MeterChart` comparten `points`; el rango se recorta antes, una vez. |
| 8 | Texto del LLM de longitud variable rompe alturas de fila. | `line-clamp-1` en tabla, texto completo en investigación; el validador anti-invención del backend ya limita `reason` a 400 caracteres. |
| 9 | Aguamarina (`EXPLAINABLE`) a 2,7:1 en light. | Solo aparece en badges con texto e icono y como fill de `ProbBars` con valor impreso; nunca como línea de gráfico. |
| 10 | ¿Sombrear la ventana de M-112 también en el gráfico de kWh? | Sí (decisión): la ventana es del caso, no del gráfico; ver el sombreado sobre una línea plana es exactamente el mensaje "consumo normal, lecturas rotas". Revisar con el evaluador si confunde. |
| 11 | 1366×768: detalle de medidor requiere scroll para ver PF. | KPI + kWh entran sin scroll (56 topbar + 24 + 72 KPI + 320 chart + header ≈ 560 px). Aceptado; alternativa sería 90 px por gráfico eléctrico, que aplasta el diente de sierra de M-112. |
