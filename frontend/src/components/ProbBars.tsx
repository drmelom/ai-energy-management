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
          {meta.confidence_parts && (
            <div className="mt-3 rounded-md bg-muted/60 p-2.5 text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">De dónde sale la confianza</div>
              <div className="num text-foreground">
                {Math.round(meta.confidence_parts.type * meta.confidence_parts.severity * meta.confidence_parts.priority * 100)} % = tipo {Math.round(meta.confidence_parts.type * 100)} % × severidad {Math.round(meta.confidence_parts.severity * 100)} % × prioridad {Math.round(meta.confidence_parts.priority * 100)} %
              </div>
              <p className="mt-1">Cada factor es la certeza que el modelo reporta para esa respuesta: qué tan concentrada está su probabilidad en el tipo elegido, en la severidad elegida y en la decisión de prioridad. La confianza de la anomalía es el producto de las tres.</p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
