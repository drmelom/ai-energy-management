# Análisis exploratorio de datos — `readings.csv` + `events.csv`

Objetivo: fijar con números la definición de baseline, los umbrales de detección y los campos de evidencia que el anomaly engine (pandas determinista) debe implementar, de forma que:

- M-104 → `EXPLAINABLE_ANOMALY` / MEDIUM, M-106 → `FALSE_POSITIVE` / LOW, M-109 → `REAL_ANOMALY` / HIGH, M-112 → `DATA_QUALITY` / HIGH.
- Los otros 8 medidores (M-101, M-102, M-103, M-105, M-107, M-108, M-110, M-111; "normales" en adelante) producen **cero** anomalías.

Todo lo que sigue se calculó sobre `backend/data/readings.csv` y `backend/data/events.csv` con pandas. Convención: día N = `2026-09-0N` (día 1 = 2026-09-01, día 14 = 2026-09-14). "Baseline" por defecto = días 1–7 salvo que se indique otra cosa.

---

## 1. Data quality audit

| Check | Resultado |
|---|---|
| Filas / columnas | 4 032 × 7 (`meter_id, timestamp, consumption_kwh, voltage_v, current_a, power_factor, status`) |
| dtypes tras `parse_dates=["timestamp"]` | `meter_id` str, `timestamp` datetime64, 4 numéricas float64, `status` str |
| Missing values | 0 en todas las columnas |
| Duplicados (fila completa / `meter_id+timestamp`) | 0 / 0 |
| Medidores | 12 (M-101…M-112), 336 filas cada uno |
| Rango temporal | 2026-09-01 00:00 → 2026-09-14 23:00, 14 días × 24 h |
| Continuidad | `diff()` de timestamp = 1 h en las 335 transiciones de cada medidor → **0 gaps, 0 saltos** |
| `status` | 100 % `"OK"` → sin información; se puede descartar |
| Valores imposibles | 0 negativos/cero en kWh, V, I; PF ∈ [0.58, 0.99] (ninguno >1 ni ≤0) |
| `events.csv` | 4 filas, 4 columnas, timestamps con formato `YYYY-MM-DD HH:MM` (sin segundos) → parsear con `pd.to_datetime` sin `format` fijo |

Rangos por medidor y columna (periodo completo):

| meter | kWh min | kWh max | V min | V max | I min | I max | PF min | PF max |
|---|---|---|---|---|---|---|---|---|
| M-101 | 19.43 | 40.20 | 217.82 | 224.81 | 96.70 | 168.63 | 0.90 | 0.98 |
| M-102 | 27.39 | 54.26 | 216.68 | 223.38 | 135.98 | 230.33 | 0.88 | 0.96 |
| M-103 | 16.15 | 32.83 | 218.70 | 224.97 | 78.68 | 142.38 | 0.92 | 0.99 |
| M-104 | 32.22 | **87.99** | 216.31 | 223.93 | 160.08 | **387.69** | 0.86 | 0.96 |
| M-105 | 23.11 | 46.45 | 216.75 | 223.36 | 116.80 | 201.95 | 0.87 | 0.99 |
| M-106 | **7.39** | 72.31 | 216.40 | 223.95 | **38.72** | 308.32 | 0.88 | 0.96 |
| M-107 | 12.60 | 25.87 | 218.33 | 224.55 | 62.49 | 117.22 | 0.91 | 0.99 |
| M-108 | 33.96 | 64.45 | 216.49 | 223.65 | 167.44 | 277.99 | 0.88 | 0.97 |
| M-109 | 28.65 | **117.51** | **213.43** | 223.64 | 143.50 | **507.43** | **0.71** | 0.98 |
| M-110 | 19.92 | 38.86 | 217.76 | 223.98 | 93.85 | 163.74 | 0.91 | 0.99 |
| M-111 | 25.95 | 49.53 | 216.99 | 223.72 | 128.32 | 215.24 | 0.88 | 0.98 |
| M-112 | 17.80 | 36.12 | **201.56** | **241.23** | **46.64** | 218.06 | 0.58 | 0.99 |

Conclusión: el dataset es sintético y limpio a nivel estructural. Toda la "calidad de dato" a detectar es de **contenido** (M-112), no de esquema. Los 8 normales viven en V ∈ [216.3, 225.0] (±2.3 % de 220 V) y PF ∈ [0.86, 0.99].

---

## 2. Perfil por medidor

Periodo completo (14 días). `day/night` = media kWh 08–17 h / media 00–05 h sobre días 1–7. `we/wd` = media kWh fin de semana / laborable.

| meter | total kWh | media h | media diaria | day/night | we/wd | V mean | V std | PF mean | PF std | PF min | I mean | I std |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-101 | 10 226.1 | 30.43 | 730.4 | 1.56 | 1.001 | 220.98 | 1.24 | 0.94 | 0.01 | 0.90 | 138.1 | 23.4 |
| M-102 | 14 088.6 | 41.93 | 1 006.3 | 1.57 | 0.987 | 219.89 | 1.25 | 0.93 | 0.02 | 0.88 | 188.7 | 31.8 |
| M-103 | 8 334.8 | 24.81 | 595.3 | 1.56 | 0.995 | 221.97 | 1.15 | 0.96 | 0.02 | 0.92 | 113.6 | 19.5 |
| M-104 | 18 543.8 | 55.19 | 1 324.6 | 1.56 | 1.129* | 220.00 | 1.19 | 0.90 | 0.02 | 0.86 | 248.8 | 63.3 |
| M-105 | 12 218.4 | 36.36 | 872.7 | 1.56 | 1.004 | 220.08 | 1.19 | 0.94 | 0.02 | 0.87 | 164.0 | 27.6 |
| M-106 | 18 376.4 | 54.69 | 1 312.6 | 1.55 | 1.032* | 219.99 | 1.18 | 0.92 | 0.02 | 0.88 | 250.5 | 57.7 |
| M-107 | 6 699.6 | 19.94 | 478.5 | 1.56 | 0.996 | 221.03 | 1.15 | 0.95 | 0.02 | 0.91 | 91.6 | 15.4 |
| M-108 | 16 954.1 | 50.46 | 1 211.0 | 1.57 | 1.000 | 219.94 | 1.19 | 0.93 | 0.02 | 0.88 | 229.0 | 38.6 |
| M-109 | 17 526.0 | 52.16 | 1 251.9 | 1.56 | 1.250* | 219.38 | 1.66 | 0.91 | 0.08 | 0.71 | 238.8 | 94.9 |
| M-110 | 9 893.4 | 29.44 | 706.7 | 1.54 | 1.002 | 221.02 | 1.18 | 0.95 | 0.02 | 0.91 | 133.3 | 22.6 |
| M-111 | 13 133.2 | 39.09 | 938.1 | 1.55 | 1.007 | 220.13 | 1.19 | 0.94 | 0.02 | 0.88 | 176.5 | 29.7 |
| M-112 | 9 256.3 | 27.55 | 661.2 | 1.55 | 1.004 | 221.10 | 4.20 | 0.94 | 0.06 | 0.58 | 125.5 | 24.9 |

\* El ratio we/wd de M-104/M-106/M-109 es artefacto de que sus anomalías caen en fin de semana (12–14 sep = sáb/dom/lun) — no es estacionalidad semanal (ver §3).

Perfil horario (días 1–7): **tres escalones idénticos en forma para los 12 medidores**, sólo cambia la escala:

| banda | horas | kWh relativo a noche |
|---|---|---|
| noche | 00–05 | 1.00 |
| hombro | 06–07 y 18–23 | 1.26–1.31 |
| día | 08–17 | 1.54–1.57 |

Ruido dentro de cada banda: el desvío estándar del residuo hora-a-hora vs perfil (`rstd`, §5) es 3.1–4.8 % de la media horaria de cada medidor.

---

## 3. Estructura temporal

- **Ciclo diario**: sí, escalón claro noche/hombro/día (tabla anterior). Transiciones a las 06:00, 08:00 y 18:00.
- **Ciclo semanal**: **no**. Media por día de la semana de los 8 normales varía < 1.5 % (p. ej. M-101: 30.2–30.8 kWh). Los normales tienen `we/wd` ∈ [0.987, 1.007].
- **Estabilidad de días 1–7**: sí, para los 12 medidores. Máx |desvío diario vs media d1–7| dentro de días 1–7 = 1.8 % (M-109 día 6). Ningún medidor tiene su anomalía antes del día 8 → **el baseline días 1–7 no está contaminado para ningún medidor**.

Totales diarios (kWh), 12 medidores × 14 días. Negrita = fuera del rango normal.

| meter | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-101 | 725.6 | 729.6 | 733.0 | 737.7 | 731.5 | 725.3 | 723.0 | 730.8 | 728.0 | 727.6 | 737.2 | 745.3 | 722.7 | 728.8 |
| M-102 | 1006.9 | 1013.0 | 1014.9 | 1005.6 | 996.3 | 987.4 | 991.9 | 1001.5 | 1009.2 | 1017.5 | 1026.4 | 996.2 | 1008.9 | 1012.8 |
| M-103 | 601.8 | 584.8 | 595.0 | 591.4 | 598.7 | 597.5 | 592.8 | 600.4 | 596.0 | 603.0 | 594.7 | 600.7 | 575.8 | 602.4 |
| M-104 | 1173.8 | 1180.7 | 1164.5 | 1159.4 | 1172.3 | 1171.7 | 1165.4 | 1169.8 | 1162.4 | 1165.0 | **1706.4** | **1708.2** | **1718.6** | **1725.6** |
| M-105 | 873.7 | 867.9 | 867.8 | 871.2 | 873.7 | 881.7 | 866.5 | 880.1 | 874.1 | 882.0 | 873.2 | 876.4 | 869.0 | 861.3 |
| M-106 | 1360.1 | 1329.8 | 1349.3 | 1371.6 | 1349.1 | 1348.3 | 1335.6 | **852.4** | 1347.4 | 1358.9 | 1338.1 | 1347.9 | 1325.9 | 1362.1 |
| M-107 | 477.7 | 480.0 | 482.8 | 477.2 | 479.0 | 475.2 | 480.0 | 488.4 | 481.6 | 468.5 | 480.1 | 474.5 | 480.0 | 474.7 |
| M-108 | 1196.4 | 1216.0 | 1218.7 | 1213.3 | 1202.4 | 1209.1 | 1213.7 | 1209.4 | 1211.4 | 1207.3 | 1213.1 | 1224.0 | 1207.7 | 1211.5 |
| M-109 | 1052.2 | 1055.9 | 1054.6 | 1061.6 | 1048.2 | 1029.6 | 1039.5 | 1039.9 | 1065.6 | 1052.7 | 1055.7 | **1569.4** | **2193.6** | **2207.6** |
| M-110 | 702.5 | 699.3 | 707.0 | 702.1 | 706.8 | 718.0 | 712.3 | 711.6 | 714.4 | 706.7 | 700.2 | 700.3 | 705.9 | 706.2 |
| M-111 | 946.8 | 928.0 | 934.0 | 943.4 | 947.4 | 940.3 | 923.4 | 925.4 | 930.4 | 936.4 | 947.0 | 941.9 | 942.1 | 946.7 |
| M-112 | 658.6 | 657.0 | 667.6 | 667.3 | 662.8 | 657.7 | 664.1 | 657.8 | 653.0 | 662.4 | 654.6 | 668.3 | 662.4 | 662.6 |

Desvío diario % vs media d1–7 (solo filas relevantes; para los normales el máximo absoluto en los 14 días es **3.16 %**, M-103 día 13):

| meter | 08 | 09 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|
| M-104 | 0.0 | -0.6 | -0.4 | **+45.9** | **+46.0** | **+46.9** | **+47.5** |
| M-106 | **-36.8** | -0.1 | 0.7 | -0.8 | -0.1 | -1.7 | 1.0 |
| M-109 | -0.8 | 1.6 | 0.4 | 0.7 | **+49.6** | **+109.2** | **+110.5** |
| M-112 | -0.7 | -1.4 | 0.0 | -1.1 | 0.9 | 0.0 | 0.1 |

### 3.1 Reproducción de las cifras del PDF

El PDF cita M-109 "2 180 kWh vs baseline ~1 070, +103.7 %", M-104 "1 860, +47.6 %", M-101 "820, +2.5 %", M-112 "690, -1.4 %". Se probaron 40 combinaciones (ventana actual ∈ {d14, d13–14, d12–14, d11–14, d8–14} × baseline ∈ {d1–3, d1–5, d1–7, d1–10, d1–11, d1–12, d1–13, d1–14, d2–8}):

| hipótesis | M-109 | M-104 | M-101 | M-112 |
|---|---|---|---|---|
| PDF | +103.7 | +47.6 | +2.5 | -1.4 |
| **último día (d14) vs media d1–7** | +110.5 | **+47.5** | -0.1 | +0.1 |
| últimos 2 días vs media d1–7 | +109.8 | +47.2 | -0.5 | +0.1 |
| d14 vs media d1–12 | +101.8 | +37.1 | -0.3 | +0.3 |
| semana 2 vs semana 1 | +38.7 | +26.5 | +0.3 | -0.3 |

Veredicto: **ninguna definición reproduce las cuatro cifras a la vez**; los kWh absolutos del PDF (1 860 / 820 / 690) no coinciden con este dataset bajo ninguna ventana (M-104 último día = 1 725.6, M-101 = 728.8, M-112 = 662.6). Las cifras del PDF son ilustrativas (probablemente otra semilla del generador). La definición que mejor encaja en signo y magnitud es **total del último día (2026-09-14) vs media diaria de días 1–7**: clava M-104 (+47.5 vs +47.6) y da a M-109 el ">100 %" esperado. Los tests deben usar las cifras de este documento, no las del PDF.

---

## 4. Deep dive por caso

Definiciones usadas:
- `bmean(m,h)` = media de kWh del medidor `m` a la hora del día `h` en días 1–7 (perfil baseline, 24 valores/medidor).
- `pct` = `(kwh − bmean) / bmean × 100` por hora.
- `rstd(m)` = std del residuo `kwh − bmean` del medidor `m` sobre días 1–7 (un escalar por medidor); `z = (kwh − bmean) / rstd`. Ver §5 sobre por qué **no** usar la std por hora-del-día.
- `p_calc` = `V·I·PF/1000` (kW ≈ kWh por ser intervalos de 1 h); `eres_pct` = `(kwh − p_calc)/kwh × 100`.

Alineación con eventos — **los 4 cambios empiezan exactamente en el timestamp del evento (lag = 0 h)**:

| meter | evento | onset detectado (primera hora de la racha) | lag |
|---|---|---|---|
| M-104 | 2026-09-11 00:00 OPERATIONAL_CHANGE | 2026-09-11 00:00 | 0 h |
| M-106 | 2026-09-08 00:00 SCHEDULED_OUTAGE | 2026-09-08 00:00 | 0 h |
| M-109 | 2026-09-12 14:00 UNKNOWN | 2026-09-12 14:00 | 0 h |
| M-112 | 2026-09-13 00:00 DATA_QUALITY | 2026-09-13 00:00 (primer flag eléctrico) | 0 h |

### 4.1 M-104 — escalón de consumo +46 %, explicado por OPERATIONAL_CHANGE

- **Patrón**: **step** permanente. Desde 2026-09-11 00:00 hasta el final (96 h) las 96 horas tienen `pct > 25 %`. `pct` medio +46.4 % (min +36.3, max +57.6), `z` medio 15.0 (min 9.4). Hora previa (10 sep 23:00) `pct` = -3.3 %.
- **Magnitud diaria**: días 11–14 = 1 706–1 726 kWh vs baseline diario 1 169.7 → +45.9 … +47.5 %. Último día +47.5 %.
- **Variables**:

| | antes (240 h) | después (96 h) | cambio |
|---|---|---|---|
| kWh/h | 48.69 | 71.45 | ×1.467 |
| I (A) | 219.1 | 322.9 | ×1.474 (consistente con kWh) |
| V | 219.97 (std 1.18) | 220.08 (std 1.22) | sin cambio |
| PF | 0.909 (min 0.863) | 0.890 (min 0.858) | -0.02 (leve; horas PF<0.88: 5 → 27) |
| eres_pct std | 3.95 | 3.29 | identidad V·I·PF intacta (max \|eres\| 17.7 %) |

- Lectura: subida física de carga (corriente sube en la misma proporción que la energía, tensión estable, PF apenas baja) coherente con "new production line". → `EXPLAINABLE_ANOMALY`, severidad MEDIUM (desvío 25–75 %).

### 4.2 M-106 — outage de 12 h, -80 %, explicado por SCHEDULED_OUTAGE

- **Ventana exacta**: 2026-09-08 00:00 → 11:00 inclusive (**12 horas**, coincide con "outage for 12 hours"). A las 12:00 vuelve a normal (`pct` -4.4 %) y desde ahí `pct` medio -0.17 %, max |pct| 11.2 %.
- **Magnitud**: en la ventana suma 126.4 kWh vs 627.3 esperados → **-79.9 %** (por hora entre -77.2 y -82.7 %; `z` medio -22.2, min -28.4). Total día 8 = 852.4 vs 1 349.1 → **-36.8 %**.
- **Patrón**: **step temporal** (bajada y recuperación limpias, 12 h de duración).
- **Variables en la ventana**: V 219.2 (std 1.09, normal), PF 0.914 (normal), I 48.0 A vs 257 A antes (×0.19, proporcional al kWh). Identidad eléctrica intacta (ratio kWh/p_calc 1.09, como el resto del dataset). No es fallo de sensor: es carga real apagada.
- Antes/después del día 8 no hay cambio de régimen (kWh/h 56.2 vs 53.2 solo por el outage; V, PF idénticos).
- Lectura: bajada real, planificada, con duración igual a la anunciada → `FALSE_POSITIVE`, LOW.

### 4.3 M-109 — escalón +110 %, sin explicación, con cambios eléctricos

- **Patrón**: **step** permanente desde 2026-09-12 14:00 hasta el final (**58 h**, 58/58 horas con `pct > 25 %`). Hora previa (13:00) `pct` -5.2 %; primera hora anómala `pct` +115 %, `z` 37.7.
- **Magnitud**: `pct` medio **+110.3 %** (min +86.1, max +129.1), `z` medio 31.1. Diario: día 12 (parcial, 10 h afectadas) +49.6 %, día 13 +109.2 %, día 14 **+110.5 %**. Ventana anómala en equivalente diario: 2 226.5 kWh vs 1 058.4 esperados (+110.4 %).
- **Variables**:

| | antes (278 h) | después (58 h) | cambio |
|---|---|---|---|
| kWh/h | 43.69 | 92.77 | ×2.124 |
| I (A) | 200.0 | 424.7 (max 507.4) | ×2.123 (consistente con kWh) |
| V | 219.90 (std 1.19; min 216.3) | 216.91 (std 1.34; min 213.4) | **-3.0 V**; 15 h con V<216 (antes 0) |
| PF | 0.940 (std 0.016; min 0.894) | 0.740 (std 0.016; max 0.782) | **-0.20, escalón limpio**; 58/58 h con PF<0.80 |
| ratio kWh/p_calc | 1.057 | 1.362 | identidad se rompe: `eres_pct` medio +26.5 % (42 h > 25 %) |

- Salto de PF en el onset: |ΔPF| = 0.22 (única hora del dataset fuera de M-112 con |ΔPF| > 0.10). **Sin saltos de tensión** (|ΔV| max 5.4 V, 0 horas > 8 V) y **0 horas con V fuera de ±5 %**: no es intermitencia, es un nuevo régimen estable.
- Evento: `UNKNOWN` / "No operational event reported" → no explica nada. → `REAL_ANOMALY`, HIGH (desvío > 75 %, además PF colapsado y V deprimida = carga inductiva grande no declarada).

### 4.4 M-112 — consumo estable, lecturas eléctricas inconsistentes

- **Consumo**: **normal**. Días 13–14 = 662.4 / 662.6 kWh vs baseline 662.2 (+0.0 / +0.1 %). En las 48 h afectadas `pct` medio +0.37 %, max |pct| 10.0 %, max |z| 2.68. Ningún detector de consumo debe dispararse.
- **Onset**: 2026-09-13 00:00 (primer flag eléctrico); afecta a las **48 h** finales. Antes de esa hora M-112 está limpio en todos los checks (0 horas V fuera de ±5 %, 0 PF<0.8, 0 |ΔV|>8, max |ΔV| 5.24, V ∈ [217.96, 224.06]).
- **Patrón**: **intermitente y periódico** — cada 3 h una hora "mala" seguida de una hora de retorno: horas 00, 03, 06, 09, 12, 15, 18, 21 de ambos días tienen V ≈ 240 ó ≈ 203 y/o PF 0.58–0.72; la hora siguiente vuelve a ≈ 220 V. Eso produce **32 horas** flaggeadas (16 "malas" + 16 de retorno con salto grande).
- **Cuantificación de la inconsistencia (48 h del 13–14 sep)**:

| check | umbral | horas M-112 | horas máx. en cualquier otro medidor |
|---|---|---|---|
| V fuera de 220 V ±10 % (198–242) | — | **0** ← el ±10 % NO detecta nada (V ∈ [201.56, 241.23]) | 0 |
| V fuera de 220 V ±5 % (209–231) | ±5 % | **16** | 0 (V normales ∈ [216.3, 225.0]) |
| PF < 0.80 | 0.80 | **12** (min 0.58) | 0 (M-109: 58, pero es régimen estable, ver §5) |
| \|ΔV\| entre horas consecutivas > 8 V | 8 V | **32** (min salto flaggeado 12.55, max 25.52) | 0 (max normal 5.64 V) |
| \|ΔPF\| > 0.15 | 0.15 | **24** (min 0.20, max 0.39) | M-109: 1 (onset, 0.22); resto 0 (max 0.09) |
| \|eres_pct\| > 25 % | 25 % | **12** (max 76.3 %; ratio kWh/p_calc ∈ [0.58, 4.22]) | 0 en los 8 normales (max 21.7 %); M-109: 42 (persistente) |
| V std / PF std en esas 48 h | — | 10.78 V / 0.137 (antes 1.21 / 0.015) | normales ≤ 1.25 / ≤ 0.02 |

- **Identidad P ≈ V·I·PF/1000 (residual por medidor, periodo completo)**:

| meter | ratio kWh/p_calc mean | std | eres_pct std | max \|eres_pct\| | h > 20 % | h > 25 % |
|---|---|---|---|---|---|---|
| M-101 | 1.062 | 0.059 | 5.18 | 20.9 | 2 | 0 |
| M-102 | 1.088 | 0.054 | 4.66 | 21.7 | 1 | 0 |
| M-103 | 1.026 | 0.059 | 5.57 | 18.0 | 0 | 0 |
| M-104 | 1.117 | 0.047 | 3.82 | 19.9 | 0 | 0 |
| M-105 | 1.073 | 0.052 | 4.58 | 18.1 | 0 | 0 |
| M-106 | 1.080 | 0.048 | 4.14 | 20.2 | 1 | 0 |
| M-107 | 1.037 | 0.069 | 6.44 | 23.0 | 2 | 0 |
| M-108 | 1.079 | 0.046 | 3.96 | 18.5 | 0 | 0 |
| M-109 | 1.110 | 0.125 | 9.08 | 32.2 | 57 | 42 |
| M-110 | 1.054 | 0.057 | 5.05 | 20.7 | 1 | 0 |
| M-111 | 1.070 | 0.050 | 4.40 | 17.9 | 0 | 0 |
| M-112 | 1.091 | **0.354** | **12.42** | **76.3** | 13 | 12 |

La identidad se cumple con un **sesgo sistemático +2…+12 %** (kWh ≈ 1.06 × V·I·PF/1000 en los normales, sin dependencia de la hora) y ruido σ ≈ 4–6 %. Por tanto el check debe ser sobre la **dispersión** (`|eres_pct| > 25 %` o ratio fuera de [0.75, 1.35]), nunca sobre residual = 0. En M-112 se rompe por horas sueltas (ratio 0.58 y 4.22); en M-109 se desplaza de forma persistente (ratio 1.36 constante tras el onset) porque el PF cae mientras kWh e I suben juntos.

- Lectura: energía registrada consistente con su histórico, pero tensión/PF/corriente con saltos físicamente implausibles (±20 V y ΔPF 0.4 hora a hora, con V·I·PF ≠ kWh). → `DATA_QUALITY`, HIGH.

---

## 5. Método de detección recomendado y umbrales validados

### 5.1 Reglas

**A. Baseline** (§6): perfil hora-del-día por medidor a partir de días 1–7 (`bmean`, 24 valores) + `rstd` escalar por medidor (std del residuo en días 1–7). Para el nivel diario: `bdaily = mean(total diario días 1–7)`.

**B. Detector de consumo (hourly)** — una hora es anómala si `|pct| ≥ 25 %` **o** `|z| ≥ 4`; se reporta un episodio si hay **≥ 3 horas consecutivas** anómalas del mismo signo. Onset = primera hora de la racha; duración = longitud; magnitud = media de `pct` en la racha.

**C. Detector de consumo (daily)** — corrobora B: `|total_día / bdaily − 1| ≥ 20 %` en algún día 8–14.

**D. Detector eléctrico (por hora)** — flags:
- `V_OUT`: V fuera de 220 V ±5 % (209–231).
- `PF_LOW`: PF < 0.80.
- `V_JUMP`: |ΔV| vs hora anterior > 8 V.
- `PF_JUMP`: |ΔPF| > 0.15.
- `IDENTITY`: |kWh − V·I·PF/1000| / kWh > 25 %.

**E. Clasificación (orden de precedencia):**
1. Si B dispara (hay episodio de consumo):
   - buscar evento del mismo medidor con `|onset − event_timestamp| ≤ 24 h` y tipo explicativo con signo coherente: `OPERATIONAL_CHANGE` explica subidas → `EXPLAINABLE_ANOMALY`; `SCHEDULED_OUTAGE` explica bajadas → `FALSE_POSITIVE`. `UNKNOWN`, `DATA_QUALITY`, ausencia de evento o signo incoherente → **no explica** → `REAL_ANOMALY`.
   - severidad por magnitud: |pct medio| ≥ 75 % → HIGH; 25–75 % → MEDIUM; `FALSE_POSITIVE` siempre LOW.
   - los flags de D se adjuntan como evidencia (M-109: `PF_LOW` 58 h, `IDENTITY` 42 h).
2. Si B **no** dispara y la suma de flags D (`V_OUT + PF_LOW + V_JUMP + PF_JUMP + IDENTITY`, contando horas distintas) ≥ **6 horas** → `DATA_QUALITY`, HIGH.
3. Si nada dispara → sin anomalía.

El orden importa: M-109 también viola D (PF < 0.80 en 58 h, identidad rota 42 h) pero **sin** `V_OUT`, `V_JUMP` ni `PF_JUMP` salvo el onset; al tener consumo anómalo se clasifica por la rama 1. M-112 no tiene consumo anómalo → rama 2. Regla auxiliar por si se quiere distinguir "fallo de sensor" de "nuevo régimen" dentro de D: **`V_JUMP ≥ 3 h` o `V_OUT ≥ 3 h` = intermitencia (DATA_QUALITY)**; M-109 tiene 0 y 0.

### 5.2 Prueba: los 4 casos disparan con la caracterización correcta

| meter | B: racha `|pct|≥25` (h) | pct medio racha | z medio | C: max \|desvío diario\| | D: V_OUT / PF_LOW / V_JUMP / PF_JUMP / IDENTITY (h) | evento en ±24 h | clase / severidad |
|---|---|---|---|---|---|---|---|
| M-104 | 96 (11 sep 00:00 → fin), signo + | +46.4 % | +15.0 | +47.5 % | 0 / 0 / 0 / 0 / 0 | OPERATIONAL_CHANGE, lag 0 h, signo ✓ | EXPLAINABLE_ANOMALY / MEDIUM |
| M-106 | 12 (8 sep 00:00–11:00), signo − | -79.9 % | -22.2 | -36.8 % | 0 / 0 / 0 / 0 / 0 | SCHEDULED_OUTAGE, lag 0 h, duración 12 h ✓ | FALSE_POSITIVE / LOW |
| M-109 | 58 (12 sep 14:00 → fin), signo + | +110.3 % | +31.1 | +110.5 % | 0 / 58 / 0 / 1 / 42 | UNKNOWN, lag 0 h → no explica | REAL_ANOMALY / HIGH |
| M-112 | 0 (max racha `|pct|>10` = 2 h) | — | max \|z\| 2.68 | +0.9 % | 16 / 12 / 32 / 24 / 12 → 32 h distintas | DATA_QUALITY (corrobora, no requerido) | DATA_QUALITY / HIGH |

### 5.3 Prueba: cero detecciones en los 8 normales, y margen

Valores máximos observados en los 8 normales (336 h × 8 = 2 688 horas) frente a cada umbral:

| métrica | umbral | peor valor normal (medidor) | horas normales que lo superan | margen |
|---|---|---|---|---|
| `|pct|` horario | 25 % | 19.9 % (M-103) | 0 (> 20 %: 0; > 15 %: 7) | 5.1 pts |
| racha `|pct| ≥ 25` | 3 h | 0 h | — | racha máx `|pct|>20` = 0 h; `>15` = 1 h; `>10` = 2 h |
| `|z|` (rstd pooled) | 4.0 | 3.51 (M-105, dentro del baseline) | 0 (> 3: 13 h; > 3.5: 1 h) | 0.49 |
| racha `|z| ≥ 4` | 3 h | 0 h | — | racha máx `|z|>3` = 1 h; `>2` = 3 h |
| desvío diario | 20 % | 3.16 % (M-103 día 13) | 0 | 16.8 pts |
| V fuera ±5 % | 209–231 | min 216.31 / max 224.97 | 0 | 7.3 V / 6.0 V |
| PF < 0.80 | 0.80 | 0.863 (M-104, normal en ese momento) / 0.87 normales | 0 | 0.06 |
| \|ΔV\| > 8 | 8 V | 5.64 (M-102) | 0 (> 5: hasta 3 h en M-105/M-106) | 2.4 V |
| \|ΔPF\| > 0.15 | 0.15 | 0.09 (M-105) | 0 (> 0.10: 0; > 0.05: hasta 11 h) | 0.06 |
| `|eres_pct|` > 25 | 25 % | 23.0 % (M-107) | 0 (> 20 %: 7 h en total) | 2 pts |
| flags D ≥ 6 h | 6 | 0 h en cualquier normal | — | 6 h |

Notas de umbral:
- **No usar la std por hora-del-día** (7 muestras): da `|z| > 4` en 11 horas normales (max 8.79 en M-107, cuya std a alguna hora es 0.27 kWh). Con `rstd` pooled por medidor el máximo normal es 3.51.
- **±10 % de tensión no detecta M-112** (sus extremos son 201.56 y 241.23 V, dentro de 198–242). Usar ±5 %; ±6/7/8 % siguen detectando 16/14/8 h, ±10 % detecta 0.
- Los umbrales de `pct` y desvío diario podrían apretarse a 20 % y 10 % con margen; se dejan en 25/20 para tolerar datos reales más ruidosos.
- `|eres_pct| > 20 %` empezaría a dar 1–2 falsos positivos por medidor; 25 % es el mínimo limpio.
- Contar ≥ 3 h consecutivas elimina todos los picos aislados normales aun si se relajasen umbrales (racha máx `|z|>2` en normales = 3 h, así que el mínimo de racha con `|z|>2` debería ser ≥ 4).

### 5.4 Ventana de correlación con eventos

Los 4 onsets coinciden al minuto con el evento (lag 0 h). Recomendación: **±24 h** entre onset y `event_timestamp` (tolera eventos registrados a resolución diaria; ningún medidor tiene dos eventos, así que no hay ambigüedad). Con ±6 h también funciona. La ventana **no basta sola**: M-109 tiene un evento a lag 0 pero de tipo `UNKNOWN` → la regla debe exigir tipo explicativo (`OPERATIONAL_CHANGE`, `SCHEDULED_OUTAGE`) y signo coherente (subida/bajada). Extra opcional para M-106: comparar duración de la racha (12 h) con la del texto ("12 hours") — coincide.

---

## 6. Definición de baseline recomendada

- **Por medidor, por hora del día, calculado sobre días 1–7** (168 h → 24 medias + 1 std pooled). Motivos: la forma del perfil es idéntica en los 12 medidores pero la escala varía ×10 (M-107 20 kWh/h vs M-106 55 kWh/h), así que la normalización debe ser por medidor; no hay ciclo semanal, así que 7 días son suficientes y no hace falta separar laborable/fin de semana.
- **Contaminación**: ninguna. Todas las anomalías empiezan el día 8 o después (primera: M-106 día 8 00:00, justo al cerrar la ventana). Máx desvío diario dentro de días 1–7 = 1.8 %.
- **Rolling (7 días previos) — no recomendado para este dataset**: el baseline móvil se contamina con la propia anomalía. Ejemplo: para M-109 el día 14 el rolling-7 sería 1 288.1 kWh (incluye días 12–13 anómalos) → desvío +71.4 % en vez de +110.5 %; para M-104 → +23.3 % en vez de +47.5 % (cae por debajo del umbral daily de 20 % a las pocas horas más). Si en producto se quiere rolling, excluir del baseline las horas ya marcadas anómalas.
- Baseline diario derivado: `bdaily = sum(bmean)` = media de totales diarios días 1–7 (idéntico numéricamente): M-101 729.4, M-102 1 002.3, M-103 594.6, M-104 1 169.7, M-105 871.8, M-106 1 349.1, M-107 478.8, M-108 1 210.0, M-109 1 048.8, M-110 706.9, M-111 937.6, M-112 662.2.
- Parametrizar `baseline_days = 7` y `baseline_start = min(timestamp)`; el engine no debe hardcodear fechas.

---

## 7. Campos de evidencia a emitir por medidor

Esquema propuesto (valores reales de este dataset; redondear a 1–2 decimales en la API):

```json
{
  "meter_id": "M-109",
  "classification": "REAL_ANOMALY",
  "severity": "HIGH",
  "baseline": {"window": ["2026-09-01", "2026-09-07"], "daily_kwh": 1048.8, "hourly_profile_rstd": 1.57},
  "consumption": {
    "onset": "2026-09-12T14:00", "end": "2026-09-14T23:00", "hours_affected": 58, "pattern": "step",
    "direction": "up", "mean_pct_deviation": 110.3, "min_pct": 86.1, "max_pct": 129.1, "mean_z": 31.1,
    "window_kwh": 5380.8, "expected_kwh": 2557.7,
    "last_day_kwh": 2207.6, "last_day_pct": 110.5, "daily_pct_by_day": {"2026-09-12": 49.6, "2026-09-13": 109.2, "2026-09-14": 110.5}
  },
  "electrical": {
    "voltage_before": 219.9, "voltage_after": 216.9, "pf_before": 0.94, "pf_after": 0.74,
    "current_before": 200.0, "current_after": 424.7, "current_ratio": 2.12, "kwh_ratio": 2.12,
    "hours_v_out_5pct": 0, "hours_pf_below_0_80": 58, "hours_v_jump_gt_8v": 0, "hours_pf_jump_gt_0_15": 1, "hours_identity_residual_gt_25pct": 42
  },
  "event": {"matched": true, "event_type": "UNKNOWN", "event_timestamp": "2026-09-12T14:00", "lag_hours": 0, "explains": false, "description": "No operational event reported"}
}
```

Valores para los otros tres casos (mismo esquema):

| campo | M-104 | M-106 | M-112 |
|---|---|---|---|
| classification / severity | EXPLAINABLE_ANOMALY / MEDIUM | FALSE_POSITIVE / LOW | DATA_QUALITY / HIGH |
| baseline.daily_kwh | 1 169.7 | 1 349.1 | 662.2 |
| consumption.onset → end | 2026-09-11 00:00 → 09-14 23:00 | 2026-09-08 00:00 → 09-08 11:00 | — (sin episodio) |
| hours_affected / pattern / direction | 96 / step / up | 12 / step (temporal) / down | 0 / — / — |
| mean_pct / min / max | +46.4 / +36.3 / +57.6 | -79.9 / -82.7 / -77.2 | +0.37 / -10.0 / +9.5 (48 h) |
| mean_z | 15.0 | -22.2 | max \|z\| 2.68 |
| window_kwh vs expected | 6 858.9 vs 4 678.7 | 126.4 vs 627.3 | 1 325.1 vs 1 324.3 (48 h) |
| last_day_kwh / last_day_pct | 1 725.6 / +47.5 | 1 362.1 / +1.0 (día 8: 852.4 / -36.8) | 662.6 / +0.1 |
| V before → after | 219.97 → 220.08 | 220.0 → 219.2 (outage) | 221.02 (std 1.21) → 221.63 (std 10.78) |
| PF before → after | 0.909 → 0.890 | 0.921 → 0.914 (outage) | 0.950 (std 0.015) → 0.875 (std 0.137, min 0.58) |
| I before → after (ratio) | 219.1 → 322.9 (×1.47; kWh ×1.47) | 257.4 → 48.0 (×0.19; kWh ×0.20) | 125.8 → 123.8 (×0.98) |
| hours V_OUT / PF_LOW / V_JUMP / PF_JUMP / IDENTITY | 0/0/0/0/0 | 0/0/0/0/0 | 16/12/32/24/12 (32 h distintas, onset 2026-09-13 00:00, patrón intermitente cada 3 h) |
| event: type / lag / explains | OPERATIONAL_CHANGE / 0 h / true | SCHEDULED_OUTAGE / 0 h / true (duración 12 h = texto) | DATA_QUALITY / 0 h / corrobora |

Para los 8 normales emitir el mismo esquema con `classification: "NORMAL"`, `consumption.hours_affected: 0`, `last_day_pct` (ver §8) y `max_abs_z` para que la UI pueda mostrar "cómo de lejos" está cada uno.

---

## 8. Números para el dashboard

- **Consumo total del periodo (14 días, 12 medidores): 155 250.8 kWh.** Semana 1 (1–7 sep): 75 327.2; semana 2 (8–14 sep): 79 923.7 (+6.1 %).
- Ventana "actual" recomendada = último día (2026-09-14) vs baseline diario días 1–7 (la que mejor encaja con el PDF, §3.1). Se incluye también semana 2 vs semana 1 por si el frontend prefiere ventana de 7 días.

| meter | total 14 d | semana 1 | semana 2 | Δ sem2 vs sem1 | último día (14 sep) | baseline diario d1–7 | Δ último día vs baseline |
|---|---|---|---|---|---|---|---|
| M-101 | 10 226.1 | 5 105.6 | 5 120.4 | +0.3 % | 728.8 | 729.4 | -0.1 % |
| M-102 | 14 088.6 | 7 016.0 | 7 072.6 | +0.8 % | 1 012.8 | 1 002.3 | +1.1 % |
| M-103 | 8 334.8 | 4 161.9 | 4 172.9 | +0.3 % | 602.4 | 594.6 | +1.3 % |
| M-104 | 18 543.8 | 8 187.7 | 10 356.1 | +26.5 % | 1 725.6 | 1 169.7 | **+47.5 %** |
| M-105 | 12 218.4 | 6 102.4 | 6 116.0 | +0.2 % | 861.3 | 871.8 | -1.2 % |
| M-106 | 18 376.4 | 9 443.8 | 8 932.7 | -5.4 % | 1 362.1 | 1 349.1 | +1.0 % |
| M-107 | 6 699.6 | 3 351.9 | 3 347.8 | -0.1 % | 474.7 | 478.8 | -0.9 % |
| M-108 | 16 954.1 | 8 469.8 | 8 484.3 | +0.2 % | 1 211.5 | 1 210.0 | +0.1 % |
| M-109 | 17 526.0 | 7 341.6 | 10 184.5 | +38.7 % | 2 207.6 | 1 048.8 | **+110.5 %** |
| M-110 | 9 893.4 | 4 948.0 | 4 945.4 | -0.1 % | 706.2 | 706.9 | -0.1 % |
| M-111 | 13 133.2 | 6 563.3 | 6 569.9 | +0.1 % | 946.7 | 937.6 | +1.0 % |
| M-112 | 9 256.3 | 4 635.1 | 4 621.2 | -0.3 % | 662.6 | 662.2 | +0.1 % |

Nota: M-106 en "último día" sale +1.0 % (su anomalía fue el día 8); el dashboard debe mostrar la anomalía por su ventana propia (día 8: -36.8 %), no por la ventana "actual".

---

## 9. Caveats / riesgos

1. **Umbrales ajustados a este dataset sintético** (ruido σ ≈ 3–5 % hora a hora, V ±2.3 %, PF ±0.02). Datos reales tendrán más varianza; los márgenes más estrechos son `|z| ≥ 4` (peor normal 3.51), PF < 0.80 (peor normal 0.86) y `|ΔPF| > 0.15` (peor normal 0.09). Exponerlos como configuración.
2. **Sin efecto fin de semana en los datos**: el baseline no lo modela. En datos reales habría que separar perfil laborable/fin de semana o el detector daily de 20 % daría falsos positivos.
3. **Baseline fijo días 1–7 depende de que la primera semana sea limpia**; aquí lo es (§6). Un rolling window sin exclusión de horas anómalas diluye la magnitud (M-109 caería de +110 % a +71 %).
4. **Identidad V·I·PF tiene sesgo +6 %** en los normales (y +11 % en M-104): sólo válida como check de dispersión (> 25 %), no como igualdad. Si en datos reales los medidores son trifásicos el factor cambia (√3) y hay que recalibrar el centro del ratio por medidor.
5. **M-109 también rompe la identidad y el PF** (58 h con PF < 0.80): la clasificación DATA_QUALITY debe ser condicional a la ausencia de anomalía de consumo (o a la presencia de saltos/intermitencia), si no M-109 se etiquetaría mal.
6. **±10 % de tensión no detecta M-112**; la banda debe ser ±5 %. Si el PDF/enunciado sugiere ±10 %, documentar la desviación.
7. **Las cifras del PDF no son reproducibles** con este CSV (kWh absolutos distintos); los tests deben fijarse a los números de §4/§8.
8. **Eventos a lag 0 h exacto**: la ventana ±24 h no se ha estresado. Con más de un evento por medidor habría que escoger el más cercano al onset y con signo coherente.
9. **Día 12 de M-109 es parcial** (+49.6 % diario): un detector sólo diario lo vería como MEDIUM ese día; la severidad debe salir de la racha horaria (+110 %) o del último día completo.
10. `status` es constante: no usarlo como señal de calidad; si en producción aparece otro valor, tratarlo como flag D adicional.
