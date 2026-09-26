import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [severity, setSeverity] = useState<'' | 'HIGH' | 'MEDIUM' | 'LOW'>('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState(false);
  const q = useQuery(() => api.anomalies({ severity: severity || undefined, type: type || undefined, priority: priority || undefined }), [severity, type, priority, version]);

  const cols: Col<AnomalySummary>[] = [
    { key: 'rank', header: '#', width: '40px', render: r => <span className="text-ink-3 num">{r.rank}</span> },
    { key: 'meter', header: 'Medidor', render: r => <Link to={`/meters/${r.meter_id}`} className="no-underline text-ink"><div className="font-semibold">{r.meter_id}</div><div className="text-xs text-ink-2">{r.meter_name}</div></Link> },
    { key: 'type', header: 'Tipo', render: r => <TypeBadge type={r.type} /> },
    { key: 'severity', header: 'Severidad', render: r => <SeverityBadge severity={r.severity} priority={r.priority} /> },
    { key: 'confidence', header: 'Confianza', render: r => <ConfidenceBar confidence={r.confidence} /> },
    { key: 'reason', header: 'Hallazgo', render: r => <span className="clamp-1 text-ink-2 max-w-[420px]" title={r.reason}>{r.reason}</span> },
    { key: 'status', header: 'Estado', render: r => <AnomalyStatusChip status={r.status} /> },
    { key: 'action', header: 'Acción', align: 'right', render: r => <Link to={`/anomalies/${r.id}`} className="btn btn-secondary h-8 px-2.5 text-xs no-underline">Investigar →</Link> },
  ];

  return (
    <AppShell title="Anomalías IA" priorityCount={q.data?.items.filter(a => a.priority).length}>
      <FilterBar right={q.data && (q.data.run_id ? `${q.data.total} anomalía${q.data.total === 1 ? '' : 's'} · análisis ${q.data.run_finished_at ? relTime(q.data.run_finished_at) : ''}` : 'sin análisis ejecutado')}>
        <SegmentedControl name="sev" label="Severidad" value={severity} onChange={setSeverity} options={[{ value: '', label: 'Todas' }, { value: 'HIGH', label: 'Alta' }, { value: 'MEDIUM', label: 'Media' }, { value: 'LOW', label: 'Baja' }]} />
        <select className="input" value={type} onChange={e => setType(e.target.value)} aria-label="Tipo de anomalía">
          <option value="">Todos los tipos</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE[t].label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-ink-2"><input type="checkbox" checked={priority} onChange={e => setPriority(e.target.checked)} />Solo prioritarias</label>
      </FilterBar>
      {q.error ? <p className="text-critical-ink">{q.error.message}</p> : q.data ?
        <div className={q.loading ? 'opacity-50' : ''}>
          <DataTable columns={cols} rows={q.data.items} rowKey={r => r.id} rowClass={r => (r.priority ? 'shadow-[inset_3px_0_0_var(--critical)]' : '')}
            empty={q.data.run_id ? 'Ninguna anomalía coincide con el filtro' : 'Ejecuta el análisis IA para detectar anomalías'} />
        </div> : <div className="card skeleton h-64" />}
    </AppShell>
  );
}
