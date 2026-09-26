import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, useQuery } from '../api/client';
import { AppShell } from '../components/AppShell';
import { SeverityBadge, StatusBadge, TypeBadge } from '../components/Badge';
import { ChartFrame } from '../components/ChartFrame';
import { SegmentedControl } from '../components/FilterBar';
import { KpiTile } from '../components/KpiTile';
import { ElectricalCharts, MeterChart, ReadingsTable } from '../components/MeterChart';
import { fmtDay, fmtDayHour, fmtKwh, fmtNum, fmtPF, fmtPct, HOUR, parseNaive } from '../lib/fmt';
import { eventMarks, segmentBounds, toChartPoints } from '../lib/shape';
import { useRun } from '../state/run';

type Range = 'all' | 'week2' | 'window';
const isoLocal = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`; };

export default function MeterDetail() {
  const { meterId = '' } = useParams();
  const { version } = useRun();
  const [resolution, setResolution] = useState<'hourly' | 'daily'>('hourly');
  const [range, setRange] = useState<Range>('all');

  const meter = useQuery(() => api.meter(meterId), [meterId, version]);
  const daily = useQuery(() => api.readings(meterId, { resolution: 'daily', include_baseline: true }), [meterId]);
  const events = useQuery(() => api.meterEvents(meterId), [meterId]);
  const anomalyId = meter.data?.anomalies[0]?.id;
  const anomaly = useQuery(() => (anomalyId ? api.anomaly(anomalyId) : Promise.resolve(null)), [anomalyId]);
  const a = anomaly.data;
  const rangeParams = range === 'week2' ? { from: '2026-09-08T00:00:00' }
    : range === 'window' && a ? { from: isoLocal(parseNaive(a.window.from) - 48 * HOUR), to: isoLocal(parseNaive(a.window.to) + 24 * HOUR) } : {};
  const readings = useQuery(() => api.readings(meterId, { resolution, include_baseline: true, ...rangeParams }), [meterId, resolution, rangeParams.from, rangeParams.to]);

  const points = useMemo(() => (readings.data ? toChartPoints(readings.data, meter.data?.baseline.hourly) : []), [readings.data, meter.data]);
  const segment = useMemo(() => (a ? segmentBounds(a) : undefined), [a]);
  const marks = useMemo(() => eventMarks(events.data?.items ?? []), [events.data]);

  const m = meter.data;
  const lastDay = daily.data?.points.at(-1);
  const tone = m?.status === 'CRITICAL' ? 'text-critical-ink' : m?.status === 'WARNING' ? 'text-warning-ink' : '';
  const aria = a ? `Consumo horario de ${meterId}. ${a.reason}` : `Consumo horario de ${meterId} dentro de la banda normal en todo el periodo.`;

  return (
    <AppShell title={m ? `${m.meter_id} · ${m.name}` : meterId} crumbs={[{ label: 'Medidores', to: '/meters' }]}>
      {meter.error && <p className="text-critical-ink">{meter.error.message}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        {m && <><span className="text-muted-foreground">{m.location}</span><StatusBadge status={m.status} />
          {m.anomalies.map(x => <span key={x.id} className="flex items-center gap-1.5"><TypeBadge type={x.type} /><SeverityBadge severity={x.severity} priority={x.priority} /><Button variant="link" size="sm" className="px-1" nativeButton={false} render={<Link to={`/anomalies/${x.id}`} />}>Investigar →</Button></span>)}
          {m.anomalies.length === 0 && <span className="text-xs text-muted-foreground">Sin anomalías en el último análisis</span>}</>}
      </div>
      <section className="grid gap-4 stagger" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <KpiTile label="Consumo actual (último día)" value={lastDay ? fmtKwh(lastDay.consumption_kwh) : '—'} loading={!lastDay} sub={lastDay && fmtDay(parseNaive(lastDay.timestamp))} />
        <KpiTile label="Baseline diario" value={lastDay?.baseline_kwh != null ? fmtKwh(lastDay.baseline_kwh) : '—'} loading={!lastDay} sub="mediana horaria · días 1–7" />
        <KpiTile label="Variación" value={<span className={tone}>{lastDay?.deviation_pct != null ? fmtPct(lastDay.deviation_pct) : '—'}</span>} loading={!lastDay} sub="último día vs baseline diario" />
        <KpiTile label="Eléctrico" value={m ? <span className="text-lg font-semibold">{fmtNum(m.stats.avg_voltage_v)} V · PF {fmtPF(m.stats.avg_power_factor)}</span> : '—'} loading={!m}
          sub={m && <>V {fmtNum(m.stats.min_voltage_v)}–{fmtNum(m.stats.max_voltage_v)} · PF mín {fmtPF(m.stats.min_power_factor)}</>} />
      </section>
      <ChartFrame title="Consumo horario" subtitle={`kWh · baseline = mediana por hora del día, ${m ? `${fmtDay(parseNaive(m.baseline.from))}–${fmtDay(parseNaive(m.baseline.to))}` : 'días 1–7'} · banda ±25 % = umbral de detección`}
        legend={[{ label: 'Real', swatch: 'line', color: 'var(--brand)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }, { label: 'Banda ±25 %', swatch: 'rect', color: 'var(--baseline)' }]}
        height={320} state={readings.error ? 'error' : readings.loading && !points.length ? 'loading' : points.length ? 'ready' : 'empty'} ariaDescription={aria}
        table={<ReadingsTable points={points} />}
        controls={<>
          <SegmentedControl label="Resolución" value={resolution} onChange={setResolution} options={[{ value: 'hourly', label: 'Horario' }, { value: 'daily', label: 'Diario' }]} />
          <SegmentedControl label="Rango" value={range} onChange={setRange} options={[{ value: 'all', label: 'Todo' }, { value: 'week2', label: 'Semana 2' }, ...(a ? [{ value: 'window' as Range, label: 'Ventana anómala' }] : [])]} />
        </>}>
        {points.length > 0 && <MeterChart points={points} resolution={resolution} segment={segment} events={marks} syncId={`meter-${meterId}`} />}
      </ChartFrame>
      <ChartFrame title="Tensión, corriente y factor de potencia" subtitle="Las tres series comparten el eje de tiempo con el gráfico de consumo · el sombreado marca la ventana anómala"
        legend={[{ label: 'Real', swatch: 'line', color: 'var(--muted-foreground)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }]}
        height={412} state={readings.error ? 'error' : points.length ? 'ready' : 'loading'}
        ariaDescription={a ? a.evidence.filter(e => e.weight === 'supporting').map(e => e.text_es).join(' ') : 'Tensión, corriente y factor de potencia dentro de rangos normales.'}>
        {points.length > 0 && <ElectricalCharts points={points} segment={segment} events={marks} syncId={`meter-${meterId}`} />}
      </ChartFrame>
      {m && m.events_count > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Eventos registrados</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5">{marks.map(e => <li key={e.x} className="text-xs flex gap-2"><span className="num text-muted-foreground">{fmtDayHour(e.x)}</span><span className="font-semibold">{e.type}</span><span className="text-muted-foreground">«{e.description}»</span></li>)}</ul>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
