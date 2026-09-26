import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useQuery } from '../api/client';
import { AppShell } from '../components/AppShell';
import { AnomalyStatusChip, Badge, SeverityBadge, TypeBadge } from '../components/Badge';
import { ChartFrame } from '../components/ChartFrame';
import { BeforeAfterTable, EventsTimeline, EvidenceList } from '../components/Evidence';
import { ConfidenceBar } from '../components/HBar';
import { Icon } from '../components/Icon';
import { ElectricalCharts, MeterChart, ReadingsTable } from '../components/MeterChart';
import { ProbBars } from '../components/ProbBars';
import { ProviderBadge } from '../components/ProviderBadge';
import { fmtIso, HOUR, parseNaive } from '../lib/fmt';
import { eventMarks, segmentBounds, toChartPoints } from '../lib/shape';

const isoLocal = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`; };

export default function Investigation() {
  const { anomalyId = '' } = useParams();
  const a = useQuery(() => api.anomaly(anomalyId), [anomalyId]);
  const d = a.data;
  const meterId = d?.meter_id;
  const range = d ? { from: isoLocal(parseNaive(d.window.from) - 48 * HOUR), to: isoLocal(parseNaive(d.window.to) + 24 * HOUR) } : null;
  const meter = useQuery(() => (meterId ? api.meter(meterId) : Promise.resolve(null)), [meterId]);
  const readings = useQuery(() => (meterId && range ? api.readings(meterId, { resolution: 'hourly', include_baseline: true, ...range }) : Promise.resolve(null)), [meterId, range?.from, range?.to]);
  const events = useQuery(() => (meterId ? api.meterEvents(meterId) : Promise.resolve(null)), [meterId]);
  const points = useMemo(() => (readings.data ? toChartPoints(readings.data, meter.data?.baseline.hourly) : []), [readings.data, meter.data]);
  const segment = useMemo(() => (d ? segmentBounds(d) : undefined), [d]);
  const marks = useMemo(() => eventMarks(events.data?.items ?? []), [events.data]);

  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = status ?? d?.status ?? 'OPEN';
  const setTo = async (s: string) => {
    if (!d) return;
    const prev = current; setStatus(s); setSaving(true); setErr(null);
    try { await api.patchAnomaly(d.id, s); } catch (e) { setStatus(prev); setErr(String((e as Error).message)); } finally { setSaving(false); }
  };

  return (
    <AppShell title={d ? `${d.meter_id} · ${d.meter_name}` : 'Investigación'} crumbs={<><Link to="/anomalies" className="text-accent-ink">Anomalías IA</Link> / #{d?.rank ?? '…'}</>}>
      {a.error && <p className="text-critical-ink">{a.error.message}</p>}
      {d && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <TypeBadge type={d.type} /><SeverityBadge severity={d.severity} priority={d.priority} />
            {d.priority && <Badge tone="critical" icon="flag">Prioritaria</Badge>}
            <span className="flex items-center gap-2 text-xs text-ink-2">Confianza <ConfidenceBar confidence={d.confidence} width={120} /></span>
            <span className="ml-auto flex gap-1.5">
              <ProviderBadge kind="decision" provider={d.ai_meta.decision_provider} notes={d.ai_meta.fallback_notes.filter(n => n.startsWith('jev') || n.startsWith('guardrail'))} latencyMs={d.ai_meta.latency_ms.decision} cached={d.ai_meta.cached?.decision} />
              <ProviderBadge kind="explanation" provider={d.ai_meta.explanation_provider} notes={d.ai_meta.fallback_notes.filter(n => n.startsWith('llm'))} latencyMs={d.ai_meta.latency_ms.explanation} cached={d.ai_meta.cached?.explanation} />
            </span>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}>
            <div className="flex flex-col gap-4 min-w-0">
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-1">Qué encontró la IA</h2>
                <p className="text-[15px] leading-6 max-w-[72ch]">{d.reason}</p>
                <p className="text-xs text-ink-2 mt-2">Ventana: {fmtIso(d.window.from)} → {fmtIso(d.window.to)} · {d.window.hours} h</p>
              </section>
              <ChartFrame title="Consumo horario en la ventana" subtitle="Ventana anómala ± 48 h · banda ±25 % = umbral de detección" height={280}
                legend={[{ label: 'Real', swatch: 'line', color: 'var(--accent)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }, { label: 'Banda ±25 %', swatch: 'rect', color: 'var(--baseline)' }]}
                state={readings.error ? 'error' : points.length ? 'ready' : 'loading'} ariaDescription={d.reason} table={<ReadingsTable points={points} />}>
                {points.length > 0 && <MeterChart points={points} resolution="hourly" segment={segment} events={marks} syncId={`inv-${d.id}`} height={280} />}
              </ChartFrame>
              <ChartFrame title="Tensión, corriente y factor de potencia" subtitle="La ausencia de cambio en V y PF también es evidencia" height={412}
                legend={[{ label: 'Real', swatch: 'line', color: 'var(--ink-2)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }]}
                state={readings.error ? 'error' : points.length ? 'ready' : 'loading'} ariaDescription={d.evidence.filter(e => e.weight === 'supporting').map(e => e.text_es).join(' ')}>
                {points.length > 0 && <ElectricalCharts points={points} segment={segment} events={marks} syncId={`inv-${d.id}`} />}
              </ChartFrame>
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-1">Evidencia</h2>
                <EvidenceList items={d.evidence} />
              </section>
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-2">Antes / después</h2>
                <BeforeAfterTable items={d.evidence} />
              </section>
            </div>
            <aside className="flex flex-col gap-4 min-w-0">
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-2">Decisión de la IA</h2>
                <ProbBars meta={d.ai_meta} winner={d.type} severity={d.severity} />
              </section>
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-2">Proveedores</h2>
                <div className="flex flex-col gap-1.5 text-xs text-ink-2">
                  <div>Decisión: <b className="text-ink">{d.ai_meta.decision_provider === 'jev' ? 'Jev (TypeSafe AI)' : 'reglas deterministas'}</b> · {d.ai_meta.latency_ms.decision} ms</div>
                  <div>Explicación: <b className="text-ink">{d.ai_meta.explanation_provider.startsWith('llm') ? d.ai_meta.explanation_provider.slice(4) : 'plantilla'}</b> · {d.ai_meta.latency_ms.explanation} ms</div>
                  {d.ai_meta.fallback_notes.length > 0 && <div className="text-warning-ink flex items-center gap-1"><Icon name="triangle-alert" size={12} />{d.ai_meta.fallback_notes.join(' · ')}</div>}
                </div>
              </section>
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-2">Eventos relacionados</h2>
                <EventsTimeline events={d.events_matched} anchor={d.window.from} />
              </section>
              <section className="card p-4">
                <h2 className="text-lg font-semibold mb-1">Acción recomendada</h2>
                <p className="text-[15px] leading-6">{d.recommended_action}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {current === 'OPEN' && <><button type="button" className="btn btn-primary" onClick={() => setTo('ACKNOWLEDGED')} disabled={saving} aria-busy={saving}>Marcar en revisión</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setTo('RESOLVED')} disabled={saving}>Resolver</button></>}
                  {current === 'ACKNOWLEDGED' && <><button type="button" className="btn btn-primary" onClick={() => setTo('RESOLVED')} disabled={saving}>Resolver</button><button type="button" className="btn btn-secondary" onClick={() => setTo('OPEN')} disabled={saving}>Reabrir</button></>}
                  {current === 'RESOLVED' && <button type="button" className="btn btn-secondary" onClick={() => setTo('OPEN')} disabled={saving}>Reabrir</button>}
                  <span className="ml-auto text-xs text-ink-2 flex items-center gap-1.5">Estado <AnomalyStatusChip status={current} /></span>
                </div>
                {err && <p className="text-critical-ink text-xs mt-2">No se pudo guardar: {err}</p>}
              </section>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
