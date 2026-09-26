import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MeterListItem } from '../api/types';
import { fmtPct } from '../lib/fmt';
import { SEVERITY, SEVERITY_RANK, TYPE_ORDER } from '../lib/semantics';
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
    <Card className="gap-0 py-0 overflow-hidden">
      <CardHeader className="px-5 pt-5 pb-3 flex-row items-baseline justify-between">
        <div>
          <CardTitle className="text-lg">Desvío frente al baseline por medidor</CardTitle>
          <CardDescription>Último día vs baseline diario (mediana horaria, días 1–7) · escala ±{Math.round(max)} %</CardDescription>
        </div>
        {!hasRun && <span className="text-xs text-muted-foreground">Ejecuta el análisis IA para clasificar los medidores</span>}
      </CardHeader>
      <CardContent className="p-0">
        <ol className="divide-y divide-border">
          {sorted.map(r => {
            const sev = r.anomaly ? SEVERITY[r.anomaly.severity] : null;
            const color = sev && sev.tone !== 'neutral' ? `var(--${sev.tone})` : 'var(--mark-neutral)';
            return (
              <li key={r.meter_id}>
                <Link to={`/meters/${r.meter_id}`} className="grid items-center gap-3 px-5 h-11 hover:bg-muted/60 transition-colors text-foreground"
                  style={{ gridTemplateColumns: '64px 110px minmax(120px, 1fr) 84px max-content' }}>
                  <span className="font-semibold">{r.meter_id}</span>
                  <span><StatusBadge status={r.status} /></span>
                  <span className="justify-self-center"><VariationBar value={r.variation_pct} max={max} color={color} width={200} /></span>
                  <span className={`num text-right ${r.anomaly && r.anomaly.severity !== 'LOW' ? 'font-semibold' : 'text-muted-foreground'}`}>{fmtPct(r.variation_pct)}</span>
                  <span className="flex gap-1.5 justify-end">
                    {r.anomaly ? <><TypeBadge type={r.anomaly.type} short /><SeverityBadge severity={r.anomaly.severity} priority={r.anomaly.priority} /></> : <span className="text-muted-foreground/60">—</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
