/** Horizontal CSS bar, 0–100, always from zero. Base of ConfidenceBar and ProbBars. */
export function HBar({ value, fill = 'var(--muted-foreground)', width = 64, height = 6, label }: { value: number; fill?: string; width?: number | string; height?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const flex = typeof width === 'string';
  return (
    <span className="inline-flex items-center gap-2 min-w-0" style={flex ? { width: '100%' } : undefined}>
      <span className="inline-block rounded-full overflow-hidden shrink" style={{ width, height, background: 'var(--grid)', flex: flex ? 1 : undefined }} role="img" aria-label={label ?? `${Math.round(v)} %`}>
        <span className="block h-full rounded-full" style={{ width: `${v}%`, background: fill }} />
      </span>
      {label && <span className="num text-foreground whitespace-nowrap">{label}</span>}
    </span>
  );
}

// Same scale the test statement uses in its anomalies table ("Alta", "Media", "Baja").
export const confidenceLabel = (c: number) => (c >= 0.8 ? 'Alta' : c >= 0.6 ? 'Media' : 'Baja');

export const ConfidenceBar = ({ confidence, width = 64 }: { confidence: number; width?: number }) => (
  <HBar value={confidence * 100} width={width} label={`${confidenceLabel(confidence)} · ${Math.round(confidence * 100)} %`} />
);

/** Bar centred on zero: length ∝ |value| / max, colour = tone of the row (severity) or neutral mark. */
export function VariationBar({ value, max, color = 'var(--mark-neutral)', width = 160 }: { value: number; max: number; color?: string; width?: number }) {
  const half = width / 2;
  const w = Math.max(1, Math.min(half, (Math.abs(value) / Math.max(1, max)) * half));
  const left = value >= 0 ? half : half - w;
  return (
    <span className="relative inline-block align-middle" style={{ width, height: 10 }} aria-hidden>
      <span className="absolute top-0 bottom-0" style={{ left: half, width: 1, background: 'var(--axis)' }} />
      <span className="absolute top-[2px] bottom-[2px] rounded-[2px]" style={{ left, width: w, background: color }} />
    </span>
  );
}
