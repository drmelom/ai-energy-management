import type { Evidence, EventRef } from '../api/types';
import { fmtIso, fmtNum, fmtPct, fmtPF, parseNaive } from '../lib/fmt';
import { EVENT_RELATION, type IconName } from '../lib/semantics';
import { Badge } from './Badge';
import { Icon } from './Icon';

const ICON: Record<string, IconName> = {
  CONSUMPTION_DEVIATION: 'trending-up', VOLTAGE_OUT_OF_BAND: 'zap', VOLTAGE_JUMPS: 'zap', VOLTAGE_SAG: 'zap',
  POWER_FACTOR_DROP: 'gauge', LOW_POWER_FACTOR: 'gauge', CURRENT_CHANGE: 'activity', POWER_RESIDUAL_ERRATIC: 'shuffle',
  EVENT_EXPLAINS: 'flag', EVENT_CORROBORATES_DQ: 'flag', EVENT_REPORTED_UNKNOWN: 'flag', NO_EXPLAINING_EVENT: 'flag', DURATION_MATCH: 'flag',
};

const fmtUnit = (v: number | null, unit: string | null) => {
  if (v == null) return '—';
  if (unit === '') return fmtPF(v);
  if (unit === 'A') return `${fmtNum(v, 0)} A`;
  if (unit === '%') return `${fmtNum(v, 0)} %`;
  return `${fmtNum(v, 1)}${unit ? ` ${unit}` : ''}`;
};

export function EvidenceList({ items }: { items: Evidence[] }) {
  const sorted = [...items].sort((a, b) => (a.weight === b.weight ? 0 : a.weight === 'primary' ? -1 : 1));
  return (
    <ol className="divide-y divide-border">
      {sorted.map((e, i) => {
        const icon = e.kind === 'CONSUMPTION_DEVIATION' && (e.deviation_pct ?? 0) < 0 ? 'trending-down' : ICON[e.kind] ?? 'flag';
        const hasPair = e.observed != null && e.expected != null && !e.kind.startsWith('EVENT_') && e.kind !== 'DURATION_MATCH';
        return (
          <li key={i} className="flex items-start gap-3 py-2.5">
            <Icon name={icon} size={16} className="text-ink-2 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5"><Badge tone="neutral" compact>{e.weight === 'primary' ? 'Principal' : 'Apoyo'}</Badge></div>
              <p className="text-ink">{e.text_es}</p>
            </div>
            {hasPair && (
              <div className="text-right num shrink-0 text-xs">
                <div className="text-ink"><span className="font-semibold">{fmtUnit(e.observed, e.unit)}</span> <span className="text-ink-3">← {fmtUnit(e.expected, e.unit)}</span></div>
                {e.deviation_pct != null && <div className="text-ink-2">{fmtPct(e.deviation_pct)}</div>}
                {e.share_pct != null && <div className="text-ink-2">{fmtNum(e.share_pct, 1)} % de las horas</div>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const VARS: { key: string; label: string; kinds: string[]; unit: 'kwh' | 'v' | 'pf' | 'a' }[] = [
  { key: 'kwh', label: 'Consumo (kWh/día)', kinds: ['CONSUMPTION_DEVIATION'], unit: 'kwh' },
  { key: 'v', label: 'Tensión', kinds: ['VOLTAGE_SAG', 'VOLTAGE_OUT_OF_BAND'], unit: 'v' },
  { key: 'pf', label: 'Factor de potencia', kinds: ['POWER_FACTOR_DROP', 'LOW_POWER_FACTOR'], unit: 'pf' },
  { key: 'i', label: 'Corriente', kinds: ['CURRENT_CHANGE'], unit: 'a' },
];

export function BeforeAfterTable({ items }: { items: Evidence[] }) {
  return (
    <table className="dt">
      <thead><tr><th>Variable</th><th style={{ textAlign: 'right' }}>Baseline</th><th style={{ textAlign: 'right' }}>Ventana</th><th style={{ textAlign: 'right' }}>Δ</th></tr></thead>
      <tbody>
        {VARS.map(v => {
          const e = items.find(x => v.kinds.includes(x.kind) && x.observed != null && x.expected != null);
          if (!e) return <tr key={v.key} style={{ height: 36 }}><td>{v.label}</td><td colSpan={3} className="text-ink-3 text-right">sin cambio</td></tr>;
          const f = (x: number) => (v.unit === 'pf' ? fmtPF(x) : v.unit === 'a' ? `${fmtNum(x, 0)} A` : v.unit === 'v' ? `${fmtNum(x, 1)} V` : fmtNum(x, 0));
          const up = e.observed! > e.expected!;
          const delta = e.deviation_pct != null ? fmtPct(e.deviation_pct) : v.unit === 'pf' ? (e.observed! - e.expected!).toLocaleString('es-CO', { maximumFractionDigits: 2, signDisplay: 'exceptZero' }) : `${fmtNum(e.observed! - e.expected!, 1)} ${v.unit === 'v' ? 'V' : ''}`;
          return (
            <tr key={v.key} style={{ height: 36 }}>
              <td>{v.label}</td><td className="num text-right">{f(e.expected!)}</td><td className="num text-right font-semibold">{f(e.observed!)}</td>
              <td className="num text-right">{delta} <span className="text-ink-3">{up ? '↑' : '↓'}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EventsTimeline({ events, anchor }: { events: EventRef[]; anchor: string }) {
  if (!events.length) return <p className="text-ink-2 text-xs">Sin eventos registrados para este medidor en ±24 h.</p>;
  const a = parseNaive(anchor);
  return (
    <ol className="relative pl-4 border-l border-border flex flex-col gap-3">
      {events.map(e => {
        const rel = EVENT_RELATION[e.relation] ?? EVENT_RELATION.unrelated;
        const lag = Math.round((parseNaive(e.timestamp) - a) / 3_600_000);
        return (
          <li key={e.event_id} className="relative">
            <span aria-hidden className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-ink-2 ring-2 ring-surface" />
            <div className="flex items-center gap-2 text-xs"><span className="num text-ink-2">{fmtIso(e.timestamp)}</span><Badge tone="neutral" compact>{e.type}</Badge></div>
            <p className="text-ink mt-0.5">«{e.description}»</p>
            <p className={`text-xs mt-0.5 text-${rel.tone}-ink font-semibold`}>{rel.label} <span className="text-ink-3 font-normal">· lag {lag} h respecto al inicio</span></p>
          </li>
        );
      })}
    </ol>
  );
}
