import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Flag, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, useQuery } from '../api/client';
import { AppShell } from '../components/AppShell';
import { AnomalyStatusChip, Badge, SeverityBadge, TypeBadge } from '../components/Badge';
import { ChartFrame } from '../components/ChartFrame';
import { BeforeAfterTable, EventsTimeline, EvidenceList } from '../components/Evidence';
import { ConfidenceBar } from '../components/HBar';
import { ElectricalCharts, MeterChart, ReadingsTable } from '../components/MeterChart';
import { ProbBars } from '../components/ProbBars';
import { ProviderBadge } from '../components/ProviderBadge';
import { fmtIso, HOUR, parseNaive } from '../lib/fmt';
import { eventMarks, segmentBounds, toChartPoints } from '../lib/shape';

const isoLocal = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00:00`; };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}

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
    <AppShell title={d ? `${d.meter_id} · ${d.meter_name}` : 'Investigación'} crumbs={[{ label: 'Anomalías IA', to: '/anomalies' }]}>
      {a.error && <p className="text-critical-ink">{a.error.message}</p>}
      {d && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <TypeBadge type={d.type} /><SeverityBadge severity={d.severity} priority={d.priority} />
            {d.priority && <Badge tone="critical"><Flag className="size-3" />Prioritaria</Badge>}
            <span className="flex items-center gap-2 text-xs text-muted-foreground">Confianza <ConfidenceBar confidence={d.confidence} width={120} /></span>
            <span className="ml-auto flex gap-1.5 flex-wrap">
              <ProviderBadge kind="decision" provider={d.ai_meta.decision_provider} notes={d.ai_meta.fallback_notes.filter(n => n.startsWith('jev') || n.startsWith('guardrail'))} latencyMs={d.ai_meta.latency_ms.decision} cached={d.ai_meta.cached?.decision} />
              <ProviderBadge kind="explanation" provider={d.ai_meta.explanation_provider} notes={d.ai_meta.fallback_notes.filter(n => n.startsWith('llm'))} latencyMs={d.ai_meta.latency_ms.explanation} cached={d.ai_meta.cached?.explanation} />
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="flex flex-col gap-4 min-w-0">
              <Section title="Qué encontró la IA">
                <p className="text-[15px] leading-6 max-w-[72ch]">{d.reason}</p>
                <p className="text-xs text-muted-foreground mt-2">Ventana: {fmtIso(d.window.from)} → {fmtIso(d.window.to)} · {d.window.hours} h</p>
              </Section>
              <ChartFrame title="Consumo horario en la ventana" subtitle="Ventana anómala ± 48 h · banda ±25 % = umbral de detección" height={280}
                legend={[{ label: 'Real', swatch: 'line', color: 'var(--brand)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }, { label: 'Banda ±25 %', swatch: 'rect', color: 'var(--baseline)' }]}
                state={readings.error ? 'error' : points.length ? 'ready' : 'loading'} ariaDescription={d.reason} table={<ReadingsTable points={points} />}>
                {points.length > 0 && <MeterChart points={points} resolution="hourly" segment={segment} events={marks} syncId={`inv-${d.id}`} height={280} />}
              </ChartFrame>
              <ChartFrame title="Tensión, corriente y factor de potencia" subtitle="La ausencia de cambio en V y PF también es evidencia" height={412}
                legend={[{ label: 'Real', swatch: 'line', color: 'var(--muted-foreground)' }, { label: 'Baseline', swatch: 'line', color: 'var(--baseline)' }]}
                state={readings.error ? 'error' : points.length ? 'ready' : 'loading'} ariaDescription={d.evidence.filter(e => e.weight === 'supporting').map(e => e.text_es).join(' ')}>
                {points.length > 0 && <ElectricalCharts points={points} segment={segment} events={marks} syncId={`inv-${d.id}`} />}
              </ChartFrame>
              <Section title="Evidencia"><EvidenceList items={d.evidence} /></Section>
              <Section title="Antes / después"><BeforeAfterTable items={d.evidence} /></Section>
            </div>
            <aside className="flex flex-col gap-4 min-w-0">
              <Section title="Decisión de la IA"><ProbBars meta={d.ai_meta} winner={d.type} severity={d.severity} /></Section>
              <Section title="Proveedores">
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <div>Decisión: <b className="text-foreground">{d.ai_meta.decision_provider === 'jev' ? 'Jev (TypeSafe AI)' : 'reglas deterministas'}</b> · {d.ai_meta.latency_ms.decision} ms</div>
                  <div>Explicación: <b className="text-foreground break-all">{d.ai_meta.explanation_provider.startsWith('llm') ? d.ai_meta.explanation_provider.slice(4) : 'plantilla'}</b> · {d.ai_meta.latency_ms.explanation} ms</div>
                  {d.ai_meta.fallback_notes.length > 0 && <div className="text-warning-ink flex items-center gap-1"><TriangleAlert className="size-3" />{d.ai_meta.fallback_notes.join(' · ')}</div>}
                </div>
              </Section>
              <Section title="Eventos relacionados"><EventsTimeline events={d.events_matched} anchor={d.window.from} /></Section>
              <Section title="Acción recomendada">
                <p className="text-[15px] leading-6">{d.recommended_action}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {current === 'OPEN' && <><Button onClick={() => setTo('ACKNOWLEDGED')} disabled={saving} aria-busy={saving}>Marcar en revisión</Button><Button variant="outline" onClick={() => setTo('RESOLVED')} disabled={saving}>Resolver</Button></>}
                  {current === 'ACKNOWLEDGED' && <><Button onClick={() => setTo('RESOLVED')} disabled={saving}>Resolver</Button><Button variant="outline" onClick={() => setTo('OPEN')} disabled={saving}>Reabrir</Button></>}
                  {current === 'RESOLVED' && <Button variant="outline" onClick={() => setTo('OPEN')} disabled={saving}>Reabrir</Button>}
                  <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">Estado <AnomalyStatusChip status={current} /></span>
                </div>
                {err && <p className="text-critical-ink text-xs mt-2">No se pudo guardar: {err}</p>}
              </Section>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
