import type { AiMeta } from '../api/types';
import { SEVERITY, TYPE, TYPE_ORDER, type AnomalyType } from '../lib/semantics';
import { SeverityBadge, TypeBadge } from './Badge';
import { HBar } from './HBar';
import { Icon } from './Icon';

export function ProbBars({ meta, winner, severity }: { meta: AiMeta; winner: AnomalyType; severity: string }) {
  if (!meta.decision_probabilities) {
    return <p className="text-xs text-muted-foreground">Clasificado con reglas deterministas — sin distribución de probabilidad.</p>;
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
            <span className="num text-xs text-right text-foreground">{Math.round(p)} %{t === winner && <Icon name="check" size={12} className="inline ml-1 text-foreground" />}</span>
          </div>
        );
      })}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Severidad y prioridad</summary>
        <div className="flex flex-col gap-1.5 mt-2">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(s => (
            <div key={s} className="grid items-center gap-2" style={{ gridTemplateColumns: '104px minmax(40px, 1fr) 52px' }}>
              <SeverityBadge severity={s} compact />
              <HBar value={(meta.severity_probabilities?.[s] ?? 0) * 100} width="100%" fill={`var(--${SEVERITY[s].tone})`} />
              <span className="num text-right">{Math.round((meta.severity_probabilities?.[s] ?? 0) * 100)} %{s === severity && <Icon name="check" size={12} className="inline ml-1" />}</span>
            </div>
          ))}
          {meta.priority_probability != null && <div className="text-muted-foreground mt-1">Prioridad: <span className="num text-foreground font-semibold">{Math.round(meta.priority_probability * 100)} %</span></div>}
          {meta.confidence_probabilities && (
            <div className="mt-2 text-muted-foreground">
              <div className="mb-1">Confianza: respuesta directa del modelo a "¿qué tan concluyente es la evidencia?"</div>
              {(['CONCLUSIVE', 'PARTIAL', 'INCONCLUSIVE'] as const).map(k => (
                <div key={k} className="grid items-center gap-2" style={{ gridTemplateColumns: '104px minmax(40px, 1fr) 52px' }}>
                  <span className="text-[11px]">{k === 'CONCLUSIVE' ? 'Concluyente' : k === 'PARTIAL' ? 'Parcial' : 'No concluyente'}</span>
                  <HBar value={(meta.confidence_probabilities?.[k] ?? 0) * 100} width="100%" fill="var(--muted-foreground)" />
                  <span className="num text-right">{Math.round((meta.confidence_probabilities?.[k] ?? 0) * 100)} %</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
