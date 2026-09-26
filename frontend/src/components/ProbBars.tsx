import type { AiMeta } from '../api/types';
import { SEVERITY, TYPE, TYPE_ORDER, type AnomalyType } from '../lib/semantics';
import { SeverityBadge, TypeBadge } from './Badge';
import { HBar } from './HBar';
import { Icon } from './Icon';

export function ProbBars({ meta, winner, severity }: { meta: AiMeta; winner: AnomalyType; severity: string }) {
  if (!meta.decision_probabilities) {
    return <p className="text-xs text-ink-2">Decidido por reglas — sin distribución de probabilidad. {meta.fallback_notes.length > 0 && <span className="text-warning-ink">({meta.fallback_notes.join(', ')})</span>}</p>;
  }
  const probs = meta.decision_probabilities;
  return (
    <div className="flex flex-col gap-2">
      {TYPE_ORDER.map(t => {
        const p = (probs[t] ?? 0) * 100;
        return (
          <div key={t} className="grid items-center gap-2" style={{ gridTemplateColumns: '104px minmax(40px, 1fr) 52px' }}>
            <TypeBadge type={t} compact short />
            <HBar value={p} width="100%" fill={`var(--${TYPE[t].tone})`} />
            <span className="num text-xs text-right text-ink">{Math.round(p)} %{t === winner && <Icon name="check" size={12} className="inline ml-1 text-ink" />}</span>
          </div>
        );
      })}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-ink-2">Severidad y prioridad</summary>
        <div className="flex flex-col gap-1.5 mt-2">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(s => (
            <div key={s} className="grid items-center gap-2" style={{ gridTemplateColumns: '104px minmax(40px, 1fr) 52px' }}>
              <SeverityBadge severity={s} compact />
              <HBar value={(meta.severity_probabilities?.[s] ?? 0) * 100} width="100%" fill={`var(--${SEVERITY[s].tone})`} />
              <span className="num text-right">{Math.round((meta.severity_probabilities?.[s] ?? 0) * 100)} %{s === severity && <Icon name="check" size={12} className="inline ml-1" />}</span>
            </div>
          ))}
          {meta.priority_probability != null && <div className="text-ink-2 mt-1">Prioridad: <span className="num text-ink font-semibold">{Math.round(meta.priority_probability * 100)} %</span></div>}
        </div>
      </details>
    </div>
  );
}
