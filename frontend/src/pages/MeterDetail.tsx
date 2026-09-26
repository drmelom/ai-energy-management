import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useQuery } from '../api/client';
import { AppShell } from '../components/AppShell';
import { SeverityBadge, StatusBadge, TypeBadge } from '../components/Badge';
import { ChartFrame } from '../components/ChartFrame';
import { SegmentedControl } from '../components/FilterBar';
import { KpiTile } from '../components/KpiTile';
import { ElectricalCharts, MeterChart, ReadingsTable } from '../components/MeterChart';
import { fmtDay, fmtIso, fmtKwh, fmtNum, fmtPF, fmtPct, parseNaive } from '../lib/fmt';
import { eventMarks, segmentBounds, toChartPoints } from '../lib/shape';
import { useRun } from '../state/run';

type Range = 'all' | 'week2' | 'window';

export function useMeterCharts(meterId: string, resolution: 'hourly' | 'daily', range: { from?: string; to?: string }, version: number) {
  const meter = useQuery(() => api.meter(meterId), [meterId, version]);
  const readings = useQuery(() => api.readings(meterId, { resolution, include_baseline: true, ...range }), [meterId, resolution, range.from, range.to]);
  const events = useQuery(() => api.meterEvents(meterId), [meterId]);
  const anomalyId = meter.data?.anomalies[0]?.id;
  const anomaly = useQuery(() => (anomalyId ? api.anomaly(anomalyId) : Promise.resolve(null)), [anomalyId]);
  const points = useMemo(() => (readings.data ? toChartPoints(readings.data, meter.data?.baseline.hourly) : []), [readings.data, meter.data]);
  const segment = useMemo(() => (anomaly.data ? segmentBounds(anomaly.data) : undefined), [anomaly.data]);
  const marks = useMemo(() => eventMarks(events.data?.items ?? []), [events.data]);
  return { meter, readings, events, anomaly, points, segment, marks };
}

export default function MeterDetail() {
  const { meterId = '' } = useParams();
  const { version } = useRun();
  const [resolution, setResolution] = useState<'hourly' | 'daily'>('hourly');
  const [range, setRange] = useState<Range>('all');
  const daily = useQuery(() => api.readings(meterId, { resolution: 'daily', include_baseline: true }), [meterId]);
  const preview = useQuery(() => api.meter(meterId), [meterId, version]);
  const win = preview.data?.anomalies[0] ? undefined : undefined;
  void win;
  const anomalyForRange = useQuery(() => (preview.data?.anomalies[0]?.id ? api.anomaly(preview.data.anomalies[0].id) : Promise.resolve(null)), [preview.data?.anomalies[0]?.id]);
  const rangeParams = range === 'week2' ? { from: '2026-09-08T00:00:00' } : range === 'window' && anomalyForRange.data
    ? { from: new Date(parseNaive(anomalyForRange.data.window.from) - 48 * 3_600_000).toISOString().slice(0, 19), to: new Date(parseNaive(anomalyForRange.data.window.to) + 24 * 3_600_000).toISOString().slice(0, 19) } : {};
  const { meter, readings, anomaly, points, segment, marks } = useMeterCharts(meterId, resolution, rangeParams, version);
  const m = meter.data;
  const lastDay = daily.data?.points.at(-1);
  const tone = m?.status === 'CRITICAL' ? 'text-critical-ink' : m?.status === 'WARNING' ? 'text-warning-ink' : '';
  const a = anomaly.data;
  const aria = a
    ? `Consumo horario de ${meterId}. ${a.reason}`
    : `Consumo horario de ${meterId} dentro de la banda normal en todo el periodo.`;

  return (
    <AppShell title={m ? `${m.meter_id} · ${m.name}` : meterId} crumbs={<><Link to="/meters" className="text-accent-ink">Medidores</Link> / {meterId}</>}>
      {meter.error && <p className="text-critical-ink">{meter.error.message}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        {m && <><span className="text-ink-2">{m.location}</span><StatusBadge status={m.status} />
          {m.anomalies.map(x => <span key={x.id} className="flex items-center gap-1.5"><TypeBadge type={x.type} /><SeverityBadge severity={x.severity} priority={x.priority} /><Link to={`/anomalies/${x.id}`} className="text-accent-ink font-semibold">Investigar →</Link></span>)}
          {m.anomalies.length === 0 && <span className="text-xs text-ink-2">Sin anomalías en el último análisis</span>}</>}
      </div>
      <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <KpiTile label="Consumo actual (último día)" value={lastDay ? fmtKwh(lastDay.consumption_kwh) : '—'} loading={!lastDay} sub={lastDay && fmtDay(parseNaive(lastDay.timestamp))} />
        <KpiTile label="Baseline diario" value={lastDay?.baseline_kwh != null ? fmtKwh(lastDay.baseline_kwh) : '—'} loading={!lastDay} sub="mediana horaria · días 1–7" />
        <KpiTile label="Variación" value={<span className={tone}>{lastDay?.deviation_pct != null ? fmtPct(lastDay.deviation_pct) : '—'}</span>} loading={!lastDay} sub="último día vs baseline diario" />
        <KpiTile label="Eléctrico" value={m ? <span className="text-lg font-semibold">{fmtNum(m.stats.avg_voltage_v)} V · PF {fmtPF(m.stats.avg_power_factor)}</span> : '—'} loading={!m}
          sub={m && <>V {fmtNum(m.stats.min_voltage_v)}–{fmtNum(m.stats.max_voltage_v)} · PF mín {fmtPF(m.stats.min_power_factor)}</>} />
      </section>
      <ChartFrame title="Consumo horario" subtitle={`kWh · baseline = mediana por hora del día, ${m ? `${fmtDay(parseNaive(m.baseline.from))}–${fmtDay(parseNaive(m.baseline.to))}` : 'días 1–7'} · banda ±25 % = umbral de detección`}
        legend={[{ label: 'Real', swatch: 'line', color: 'var(--accent)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }, { label: 'Banda ±25 %', swatch: 'rect', color: 'var(--baseline)' }]}
        height={320} state={readings.error ? 'error' : readings.loading && !points.length ? 'loading' : points.length ? 'ready' : 'empty'} ariaDescription={aria}
        table={<ReadingsTable points={points} />}
        controls={<>
          <SegmentedControl name="res" label="Resolución" value={resolution} onChange={setResolution} options={[{ value: 'hourly', label: 'Horario' }, { value: 'daily', label: 'Diario' }]} />
          <SegmentedControl name="range" label="Rango" value={range} onChange={setRange} options={[{ value: 'all', label: 'Todo' }, { value: 'week2', label: 'Semana 2' }, ...(a ? [{ value: 'window' as Range, label: 'Ventana anómala' }] : [])]} />
        </>}>
        {points.length > 0 && <MeterChart points={points} resolution={resolution} segment={segment} events={marks} syncId={`meter-${meterId}`} />}
      </ChartFrame>
      <ChartFrame title="Tensión, corriente y factor de potencia" subtitle="Las tres series comparten el eje de tiempo con el gráfico de consumo · el sombreado marca la ventana anómala"
        legend={[{ label: 'Real', swatch: 'line', color: 'var(--ink-2)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }]}
        height={412} state={readings.error ? 'error' : points.length ? 'ready' : 'loading'}
        ariaDescription={a ? a.evidence.filter(e => e.weight === 'supporting').map(e => e.text_es).join(' ') : 'Tensión, corriente y factor de potencia dentro de rangos normales.'}>
        {points.length > 0 && <ElectricalCharts points={points} segment={segment} events={marks} syncId={`meter-${meterId}`} />}
      </ChartFrame>
      {m && m.events_count > 0 && (
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-2">Eventos registrados</h3>
          <ul className="flex flex-col gap-1.5">{(marks).map(e => <li key={e.x} className="text-xs flex gap-2"><span className="num text-ink-2">{fmtIso(new Date(e.x - new Date(e.x).getTimezoneOffset() * 60000).toISOString().slice(0, 19))}</span><span className="font-semibold">{e.type}</span><span className="text-ink-2">«{e.description}»</span></li>)}</ul>
        </div>
      )}
    </AppShell>
  );
}
