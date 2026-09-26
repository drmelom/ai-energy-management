import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { api, useQuery } from '../api/client';
import { AppShell, RunButton } from '../components/AppShell';
import { Badge, StatusBadge, TypeBadge } from '../components/Badge';
import { FleetRanking } from '../components/FleetRanking';
import { HBar } from '../components/HBar';
import { KpiTile } from '../components/KpiTile';
import { ProviderBadge } from '../components/ProviderBadge';
import { fmtDay, fmtKwh, parseNaive, relTime } from '../lib/fmt';
import { TYPE_ORDER, type MeterStatus } from '../lib/semantics';
import { useRun } from '../state/run';
import { useRiseIn } from '../lib/motion';

export default function Dashboard() {
  const { version, active, run } = useRun();
  const dash = useQuery(() => api.dashboard(), [version]);
  const meters = useQuery(() => api.meters({ sort: 'severity' }), [version]);
  const d = dash.data;
  const last = d?.last_analysis;
  const kpis = useRef<HTMLElement>(null);
  useRiseIn(kpis, ':scope > *', [!!d]);
  const period = d ? `${fmtDay(parseNaive(d.consumption.period_from))} – ${fmtDay(parseNaive(d.consumption.period_to))}` : '';
  return (
    <AppShell title="Dashboard" priorityCount={d?.anomalies.priority}>
      <section ref={kpis} className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }} aria-label="Indicadores">
        <KpiTile label="Medidores" count={d ? { to: d.meters.total, format: n => String(Math.round(n)) } : undefined} value="—" loading={!d}
          sub={d && (['NORMAL', 'WARNING', 'CRITICAL', 'UNKNOWN'] as MeterStatus[]).filter(s => d.meters.by_status[s]).map(s => <span key={s} className="flex items-center gap-1"><span className="num font-semibold text-foreground">{d.meters.by_status[s]}</span><StatusBadge status={s} compact /></span>)} />
        <KpiTile label="Consumo del periodo" count={d ? { to: d.consumption.total_kwh, format: n => fmtKwh(n) } : undefined} value="—" loading={!d} sub={d && <>{period} · media {fmtKwh(d.consumption.avg_daily_kwh, 0)}/día</>} />
        <KpiTile label="Anomalías IA" count={d ? { to: d.anomalies.total, format: n => String(Math.round(n)) } : undefined} value="—" loading={!d}
          sub={d && (d.anomalies.total ? TYPE_ORDER.filter(t => d.anomalies.by_type[t]).map(t => <span key={t} className="flex items-center gap-1"><span className="num font-semibold text-foreground">{d.anomalies.by_type[t]}</span><TypeBadge type={t} compact short /></span>) : 'sin análisis ejecutado')} />
        <KpiTile label="Alta prioridad" count={d ? { to: d.anomalies.priority, format: n => String(Math.round(n)) } : undefined} value="—" loading={!d} tone={d?.anomalies.priority ? 'critical' : undefined} sub={d && (d.anomalies.priority ? 'requieren investigación' : 'nada pendiente')} />
        <KpiTile label="Confianza IA" count={d?.anomalies.avg_confidence != null ? { to: d.anomalies.avg_confidence * 100, format: n => `${Math.round(n)} %` } : undefined} value="—" loading={!d}
          sub={d && <span className="flex flex-col gap-1.5 w-full">{d.anomalies.avg_confidence != null && <HBar value={d.anomalies.avg_confidence * 100} width={96} />}<span className="flex gap-1 flex-wrap"><ProviderBadge kind="decision" provider={d.ai_mode.decision} /><ProviderBadge kind="explanation" provider={d.ai_mode.explanation} /></span></span>} />
        <KpiTile label="Último análisis" value={active ? 'En curso' : last ? relTime(last.finished_at ?? last.started_at) : 'Nunca'} loading={!d}
          sub={d && (active ? <Badge tone="warning">Analizando · {run?.stages?.filter(s => s.status === 'done').length ?? 0}/7</Badge>
            : last ? <><Badge tone={last.status === 'COMPLETED' ? 'ok' : 'critical'}>{last.status === 'COMPLETED' ? 'Completado' : 'Fallido'}</Badge><Link to="/analysis" className="text-primary hover:underline">Ver detalle</Link></>
            : <RunButton size="sm" />)} />
      </section>
      {dash.error && <p className="text-critical-ink">No se pudo cargar el resumen: {dash.error.message}</p>}
      {meters.data ? <FleetRanking rows={meters.data.items} hasRun={!!meters.data.analysis_run_id} /> : <Skeleton className="h-[560px] rounded-xl" />}
      {last?.headline && !active && (
        <p className="text-xs text-muted-foreground">Último análisis: <span className="text-foreground font-semibold">{last.headline}</span> · <Link to="/anomalies" className="text-primary hover:underline">Ver anomalías</Link></p>
      )}
    </AppShell>
  );
}
