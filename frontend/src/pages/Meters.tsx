import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, useQuery } from '../api/client';
import type { MeterListItem } from '../api/types';
import { AppShell } from '../components/AppShell';
import { SeverityBadge, StatusBadge, TypeBadge } from '../components/Badge';
import { DataTable, type Col } from '../components/DataTable';
import { FilterBar, SearchInput, SegmentedControl } from '../components/FilterBar';
import { bySeverity } from '../components/FleetRanking';
import { VariationBar } from '../components/HBar';
import { fmtNum, fmtPct } from '../lib/fmt';
import { SEVERITY } from '../lib/semantics';
import { useRun } from '../state/run';

type StatusFilter = 'ALL' | 'NORMAL' | 'WARNING' | 'CRITICAL';

export default function Meters() {
  const { version } = useRun();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<string>('severity');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const q = useQuery(() => api.meters({ status: status === 'ALL' ? undefined : status, search: search || undefined, sort: sort === 'severity' ? 'meter_id' : sort, order }), [status, search, sort, order, version]);
  const onSearch = useCallback((v: string) => setSearch(v), []);

  const rows = useMemo(() => {
    const items = q.data?.items ?? [];
    if (sort !== 'severity') return items;
    const sorted = [...items].sort(bySeverity);
    return order === 'asc' ? sorted.reverse() : sorted;
  }, [q.data, sort, order]);
  const max = Math.max(1, ...rows.map(r => Math.abs(r.variation_pct)));

  const onSort = (key: string) => {
    if (key === sort) setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder(key === 'meter_id' ? 'asc' : 'desc'); }
  };

  const cols: Col<MeterListItem>[] = [
    { key: 'meter_id', header: 'Medidor', sortable: true, render: r => <div><div className="font-semibold">{r.meter_id}</div><div className="text-xs text-muted-foreground">{r.name} · {r.location}</div></div> },
    { key: 'status', header: 'Estado', render: r => <StatusBadge status={r.status} /> },
    { key: 'consumption', header: 'Consumo (kWh)', align: 'right', sortable: true, render: r => <span className="num">{fmtNum(r.total_consumption_kwh)}</span> },
    { key: 'variation', header: `Variación último día · escala ±${Math.round(max)} %`, sortable: true, render: r => {
      const sev = r.anomaly ? SEVERITY[r.anomaly.severity] : null;
      return <span className="flex items-center gap-3"><VariationBar value={r.variation_pct} max={max} color={sev && sev.tone !== 'neutral' ? `var(--${sev.tone})` : 'var(--mark-neutral)'} /><span className={`num ${r.anomaly ? 'font-semibold' : 'text-muted-foreground'}`}>{fmtPct(r.variation_pct)}</span></span>;
    } },
    { key: 'severity', header: 'Anomalía IA', sortable: true, render: r => r.anomaly ? <span className="flex gap-1.5"><TypeBadge type={r.anomaly.type} /><SeverityBadge severity={r.anomaly.severity} priority={r.anomaly.priority} /></span> : <span className="text-muted-foreground/60">—</span> },
    { key: 'link', header: '', align: 'right', render: r => <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={`/meters/${r.meter_id}`} />}>Ver detalle →</Button> },
  ];

  return (
    <AppShell title="Medidores">
      <FilterBar right={q.data && `${q.data.total} medidor${q.data.total === 1 ? '' : 'es'}`}>
        <SegmentedControl label="Filtrar por estado" value={status} onChange={setStatus}
          options={[{ value: 'ALL', label: 'Todos' }, { value: 'NORMAL', label: 'Normal' }, { value: 'WARNING', label: 'Alerta' }, { value: 'CRITICAL', label: 'Crítico' }]} />
        <SearchInput value={search} onChange={onSearch} placeholder="Buscar medidor…" />
      </FilterBar>
      {q.error ? <p className="text-critical-ink">{q.error.message}</p> :
        <div className={q.loading && q.data ? 'opacity-50' : ''}>
          {q.data ? <DataTable columns={cols} rows={rows} rowKey={r => r.meter_id} sort={sort} order={order} onSort={onSort} empty="Ningún medidor coincide con el filtro" /> : <Skeleton className="h-[560px] rounded-xl" />}
        </div>}
    </AppShell>
  );
}
