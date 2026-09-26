import { Link } from 'react-router-dom';
import type { MeterListItem } from '../api/types';
import { fmtPct } from '../lib/fmt';
import { SEVERITY, SEVERITY_RANK, STATUS, TYPE_ORDER } from '../lib/semantics';
import { SeverityBadge, StatusBadge, TypeBadge } from './Badge';
import { VariationBar } from './HBar';

export const bySeverity = (a: MeterListItem, b: MeterListItem) =>
  (a.anomaly ? SEVERITY_RANK[a.anomaly.severity] : 9) - (b.anomaly ? SEVERITY_RANK[b.anomaly.severity] : 9)
  || (a.anomaly ? TYPE_ORDER.indexOf(a.anomaly.type) : 9) - (b.anomaly ? TYPE_ORDER.indexOf(b.anomaly.type) : 9)
  || Math.abs(b.variation_pct) - Math.abs(a.variation_pct);

export function FleetRanking({ rows, hasRun }: { rows: MeterListItem[]; hasRun: boolean }) {
  const sorted = [...rows].sort(bySeverity);
  const max = Math.max(1, ...sorted.map(r => Math.abs(r.variation_pct)));
  return (
    <div className="card">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold">Desvío frente al baseline por medidor</h2>
          <p className="text-xs text-ink-2">Último día vs baseline diario (mediana horaria, días 1–7) · escala ±{Math.round(max)} %</p>
        </div>
        {!hasRun && <span className="text-xs text-ink-2">Ejecuta el análisis IA para clasificar los medidores</span>}
      </div>
      <ol className="divide-y divide-border">
        {sorted.map(r => {
          const sev = r.anomaly ? SEVERITY[r.anomaly.severity] : null;
          const color = sev && sev.tone !== 'neutral' ? `var(--${sev.tone})` : 'var(--mark-neutral)';
          return (
            <li key={r.meter_id}>
              <Link to={`/meters/${r.meter_id}`} className="grid items-center gap-3 px-4 h-11 hover:bg-surface-2 no-underline text-ink"
                style={{ gridTemplateColumns: '64px 110px minmax(120px, 1fr) 84px max-content' }}>
                <span className="font-semibold">{r.meter_id}</span>
                <span><StatusBadge status={r.status} /></span>
                <span className="justify-self-center"><VariationBar value={r.variation_pct} max={max} color={color} width={200} /></span>
                <span className={`num text-right ${r.anomaly && r.anomaly.severity !== 'LOW' ? 'font-semibold' : 'text-ink-2'}`}>{fmtPct(r.variation_pct)}</span>
                <span className="flex gap-1.5 justify-end">
                  {r.anomaly ? <><TypeBadge type={r.anomaly.type} short /><SeverityBadge severity={r.anomaly.severity} priority={r.anomaly.priority} /></> : <span className="text-ink-3">—</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="sr-only">{STATUS.NORMAL.label}</div>
    </div>
  );
}
