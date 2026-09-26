import type { ReactNode } from 'react';
import type { AiMeta } from '../api/types';
import { SEVERITY, TYPE, TYPE_ORDER, type AnomalyType } from '../lib/semantics';
import { SeverityBadge, TypeBadge } from './Badge';
import { HBar } from './HBar';
import { Icon } from './Icon';

const pct = (v: number | undefined | null) => Math.round((v ?? 0) * 100);
const Row = ({ label, value, fill, winner }: { label: ReactNode; value: number; fill: string; winner?: boolean }) => (
  <div className="grid items-center gap-2" style={{ gridTemplateColumns: '104px minmax(40px, 1fr) 52px' }}>
    {label}
    <HBar value={value} width="100%" fill={fill} />
    <span className="num text-xs text-right text-foreground">{Math.round(value)} %{winner && <Icon name="check" size={12} className="inline ml-1" />}</span>
  </div>
);

/** Breakdown line reused by the card and by the confidence tooltips. */
export function ConfidenceFormula({ parts, confidence }: { parts: Record<string, number>; confidence: number }) {
  return (
    <span className="num">{pct(confidence)} % = tipo {pct(parts.type)} % × severidad {pct(parts.severity)} % × prioridad {pct(parts.priority)} %</span>
  );
}

export function ProbBars({ meta, winner, severity, priority, confidence }: { meta: AiMeta; winner: AnomalyType; severity: string; priority: boolean; confidence: number }) {
  if (!meta.decision_probabilities) {
    return <p className="text-xs text-muted-foreground">Clasificado con reglas deterministas — sin distribución de probabilidad.</p>;
  }
  const probs = meta.decision_probabilities;
  const p = meta.priority_probability ?? 0;
  return (
    <div className="flex flex-col gap-4 text-xs">
      <section>
        <p className="eyebrow mb-1.5">1 · Tipo</p>
        <div className="flex flex-col gap-1.5">
          {TYPE_ORDER.map(t => <Row key={t} label={<TypeBadge type={t} compact short />} value={(probs[t] ?? 0) * 100} fill={`var(--${TYPE[t].tone})`} winner={t === winner} />)}
        </div>
      </section>
      <section>
        <p className="eyebrow mb-1.5">2 · Severidad</p>
        <div className="flex flex-col gap-1.5">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(s => <Row key={s} label={<SeverityBadge severity={s} compact />} value={(meta.severity_probabilities?.[s] ?? 0) * 100} fill={`var(--${SEVERITY[s].tone})`} winner={s === severity} />)}
        </div>
      </section>
      <section>
        <p className="eyebrow mb-1.5">3 · Prioridad</p>
        <div className="flex flex-col gap-1.5">
          <Row label={<span className="text-[11px]">Investigar ya</span>} value={p * 100} fill="var(--critical)" winner={priority} />
          <Row label={<span className="text-[11px]">Puede esperar</span>} value={(1 - p) * 100} fill="var(--mark-neutral)" winner={!priority} />
        </div>
      </section>
      {meta.confidence_parts && (
        <section className="rounded-md bg-muted/60 p-2.5 text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">De dónde sale la confianza</p>
          <p className="text-foreground"><ConfidenceFormula parts={meta.confidence_parts} confidence={confidence} /></p>
          <p className="mt-1">Cada factor es la certeza que el modelo reporta para esa respuesta: qué tan concentrada está su probabilidad en la opción elegida. La confianza de la anomalía es el producto de las tres.</p>
        </section>
      )}
    </div>
  );
}
