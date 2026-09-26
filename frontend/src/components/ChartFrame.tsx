import { useId, useState, type ReactNode } from 'react';

export interface LegendItem { label: string; swatch: 'line' | 'rect' | 'dash'; color: string }

export function ChartFrame({ title, subtitle, legend = [], controls, ariaDescription, state = 'ready', height, children, table }: {
  title: string; subtitle?: string; legend?: LegendItem[]; controls?: ReactNode; ariaDescription?: string;
  state?: 'loading' | 'ready' | 'empty' | 'error'; height: number; children: ReactNode; table?: ReactNode;
}) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  return (
    <figure role="figure" aria-labelledby={`${id}-t`} aria-description={ariaDescription} className="card p-4 m-0">
      <figcaption className="flex items-start gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-lg font-semibold leading-7">{title}</h3>
          {subtitle && <p className="text-xs text-ink-2">{subtitle}</p>}
        </div>
        {legend.length > 0 && (
          <ul className="flex items-center gap-4 text-xs text-ink-2 ml-2 mt-1.5 flex-wrap">
            {legend.map(l => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span aria-hidden style={{ width: 14, height: l.swatch === 'rect' ? 10 : 2, background: l.color, opacity: l.swatch === 'rect' ? 0.6 : 1, borderRadius: 1 }} />
                {l.label}
              </li>
            ))}
          </ul>
        )}
        <div className="ml-auto flex items-center gap-2">
          {controls}
          {table && <button type="button" className="btn btn-secondary h-8 px-2.5 text-xs" onClick={() => setShowTable(s => !s)} aria-pressed={showTable}>{showTable ? 'Ver gráfico' : 'Ver tabla'}</button>}
        </div>
      </figcaption>
      <div style={{ height }} className={state === 'loading' && !children ? 'skeleton' : ''}>
        {state === 'empty' && <div className="h-full grid place-items-center text-ink-2">Sin lecturas en el rango</div>}
        {state === 'error' && <div className="h-full grid place-items-center text-critical-ink">No se pudieron cargar las lecturas</div>}
        {(state === 'ready' || state === 'loading') && (showTable && table ? <div className="h-full overflow-auto">{table}</div> : <div className={`h-full ${state === 'loading' ? 'opacity-50' : ''}`}>{children}</div>)}
      </div>
    </figure>
  );
}
