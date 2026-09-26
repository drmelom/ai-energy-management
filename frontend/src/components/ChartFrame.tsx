import { useId, useRef, useState, type ReactNode } from 'react';
import { useRiseIn } from '../lib/motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface LegendItem { label: string; swatch: 'line' | 'rect' | 'dash'; color: string }

export function ChartFrame({ title, subtitle, legend = [], controls, ariaDescription, state = 'ready', height, children, table }: {
  title: string; subtitle?: string; legend?: LegendItem[]; controls?: ReactNode; ariaDescription?: string;
  state?: 'loading' | 'ready' | 'empty' | 'error'; height: number; children: ReactNode; table?: ReactNode;
}) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useRiseIn(body, ':scope > *', [state === 'ready']);
  return (
    <Card className="gap-3" role="figure" aria-labelledby={`${id}-t`} aria-description={ariaDescription}>
      <CardHeader className="flex flex-row flex-wrap items-start gap-3">
        <div className="min-w-0">
          <CardTitle id={`${id}-t`} className="text-lg">{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </div>
        {legend.length > 0 && (
          <ul className="flex items-center gap-4 text-xs text-muted-foreground mt-1.5 flex-wrap">
            {legend.map(l => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span aria-hidden style={{ width: 14, height: l.swatch === 'rect' ? 10 : 2, background: l.color, opacity: l.swatch === 'rect' ? 0.6 : 1, borderRadius: 2 }} />
                {l.label}
              </li>
            ))}
          </ul>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {controls}
          {table && <Button variant="outline" size="sm" onClick={() => setShowTable(s => !s)} aria-pressed={showTable}>{showTable ? 'Ver gráfico' : 'Ver tabla'}</Button>}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={body} style={{ height }}>
          {state === 'loading' && !children && <Skeleton className="h-full w-full" />}
          {state === 'empty' && <div className="h-full grid place-items-center text-muted-foreground">Sin lecturas en el rango</div>}
          {state === 'error' && <div className="h-full grid place-items-center text-critical-ink">No se pudieron cargar las lecturas</div>}
          {(state === 'ready' || (state === 'loading' && children)) && (showTable && table ? <div className="h-full overflow-auto">{table}</div> : <div className={cn('h-full', state === 'loading' && 'opacity-50')}>{children}</div>)}
        </div>
      </CardContent>
    </Card>
  );
}
