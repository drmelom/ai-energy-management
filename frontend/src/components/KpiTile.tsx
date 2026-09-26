import type { ReactNode } from 'react';

export function KpiTile({ label, value, sub, tone, loading }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'critical' | 'warning'; loading?: boolean }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="text-xs text-ink-2">{label}</div>
      {loading ? <div className="skeleton h-8 w-24 mt-1" /> :
        <div className={`display mt-1 truncate ${tone === 'critical' ? 'text-critical-ink' : tone === 'warning' ? 'text-warning-ink' : ''}`}>{value}</div>}
      {sub && <div className="text-xs text-ink-2 mt-1.5 flex items-center gap-1.5 flex-wrap min-h-5">{sub}</div>}
    </div>
  );
}
