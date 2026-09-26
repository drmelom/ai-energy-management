import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, useQuery } from '../api/client';
import type { AnomalySummary } from '../api/types';
import { AppShell } from '../components/AppShell';
import { AnomalyStatusChip, SeverityBadge, TypeBadge } from '../components/Badge';
import { DataTable, type Col } from '../components/DataTable';
import { FilterBar, SegmentedControl } from '../components/FilterBar';
import { ConfidenceBar } from '../components/HBar';
import { relTime } from '../lib/fmt';
import { TYPE, TYPE_ORDER } from '../lib/semantics';
import { useRun } from '../state/run';

export default function Anomalies() {
  const { version } = useRun();
  const [severity, setSeverity] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [type, setType] = useState('ALL');
  const [priority, setPriority] = useState(false);
  const q = useQuery(() => api.anomalies({ severity: severity === 'ALL' ? undefined : severity, type: type === 'ALL' ? undefined : type, priority: priority || undefined }), [severity, type, priority, version]);

  const cols: Col<AnomalySummary>[] = [
    { key: 'rank', header: '#', width: '40px', render: r => <span className="text-muted-foreground num">{r.rank}</span> },
    { key: 'meter', header: 'Medidor', render: r => <Link to={`/meters/${r.meter_id}`} className="text-foreground"><div className="font-semibold">{r.meter_id}</div><div className="text-xs text-muted-foreground">{r.meter_name}</div></Link> },
    { key: 'type', header: 'Tipo', render: r => <TypeBadge type={r.type} /> },
    { key: 'severity', header: 'Severidad', render: r => <SeverityBadge severity={r.severity} priority={r.priority} /> },
    { key: 'confidence', header: 'Confianza', render: r => <ConfidenceBar confidence={r.confidence} /> },
    { key: 'reason', header: 'Hallazgo', render: r => <span className="clamp-1 text-muted-foreground min-w-[240px] max-w-[520px] block" title={r.reason}>{r.reason}</span> },
    { key: 'status', header: 'Estado', render: r => <AnomalyStatusChip status={r.status} /> },
    { key: 'action', header: 'Acción', align: 'right', render: r => <Button variant="outline" size="sm" render={<Link to={`/anomalies/${r.id}`} />}>Investigar →</Button> },
  ];

  return (
    <AppShell title="Anomalías IA" priorityCount={q.data?.items.filter(a => a.priority).length}>
      <FilterBar right={q.data && (q.data.run_id ? `${q.data.total} anomalía${q.data.total === 1 ? '' : 's'} · análisis ${q.data.run_finished_at ? relTime(q.data.run_finished_at) : ''}` : 'sin análisis ejecutado')}>
        <SegmentedControl label="Severidad" value={severity} onChange={setSeverity} options={[{ value: 'ALL', label: 'Todas' }, { value: 'HIGH', label: 'Alta' }, { value: 'MEDIUM', label: 'Media' }, { value: 'LOW', label: 'Baja' }]} />
        <Select value={type} onValueChange={v => setType(v ?? 'ALL')}>
          <SelectTrigger className="w-48" aria-label="Tipo de anomalía"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            {TYPE_ORDER.map(t => <SelectItem key={t} value={t}>{TYPE[t].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label className="flex items-center gap-2 text-muted-foreground font-normal"><Checkbox checked={priority} onCheckedChange={v => setPriority(v === true)} />Solo prioritarias</Label>
      </FilterBar>
      {q.error ? <p className="text-critical-ink">{q.error.message}</p> : q.data ?
        <div className={q.loading ? 'opacity-50' : ''}>
          <DataTable columns={cols} rows={q.data.items} rowKey={r => r.id} rowClass={r => (r.priority ? 'shadow-[inset_3px_0_0_var(--critical)]' : '')}
            empty={q.data.run_id ? 'Ninguna anomalía coincide con el filtro' : 'Ejecuta el análisis IA para detectar anomalías'} />
        </div> : <Skeleton className="h-64 rounded-xl" />}
    </AppShell>
  );
}
