import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, OctagonAlert, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AnalysisRun, StageProgress } from '../api/types';
import { fmtDur, parseNaive } from '../lib/fmt';
import { SeverityBadge } from './Badge';

const dur = (s: StageProgress) => (s.started_at && s.finished_at ? (parseNaive(s.finished_at) - parseNaive(s.started_at)) / 1000 : null);

function Glyph({ status, degraded }: { status: StageProgress['status']; degraded?: boolean }) {
  const base = 'size-6 rounded-full grid place-items-center shrink-0 transition-colors';
  if (status === 'done') return <span className={cn(base, 'bg-ok text-white relative')}><Check className="size-3.5" />{degraded && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-warning ring-2 ring-card" />}</span>;
  if (status === 'running') return <span className={cn(base, 'border-2 border-primary border-t-transparent animate-spin')} aria-label="en curso" />;
  if (status === 'failed') return <span className={cn(base, 'bg-critical text-white')}><X className="size-3.5" /></span>;
  return <span className={cn(base, 'border-2 border-border')} />;
}

function LiveSeconds() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  return <span className="num text-muted-foreground/70 text-xs">{fmtDur((now - start) / 1000)}</span>;
}

export function AnalysisStepper({ run, degraded }: { run: AnalysisRun; degraded?: boolean }) {
  const stages = run.stages ?? [];
  return (
    <Card>
      <CardContent>
        <ol aria-live="polite" className="flex flex-col">
          {stages.map((s, i) => (
            <li key={s.key} className="flex items-start gap-3 relative">
              {i < stages.length - 1 && <span aria-hidden className="absolute left-[11px] top-7 bottom-0 w-px bg-border" />}
              <Glyph status={s.status} degraded={s.key === 'explanation' && degraded} />
              <div className="flex-1 min-w-0 pb-5">
                <div className="flex items-center justify-between gap-3 leading-6">
                  <span className={cn(s.status === 'pending' ? 'text-muted-foreground/70' : s.status === 'failed' ? 'text-critical-ink' : 'text-foreground', s.status === 'running' && 'font-semibold')}>{s.label}</span>
                  {s.status === 'done' && dur(s) != null && <span className="num text-muted-foreground/70 text-xs">{fmtDur(dur(s)!)}</span>}
                  {s.status === 'running' && <LiveSeconds key={s.key} />}
                </div>
                {s.status === 'running' && <Skeleton className="h-3 w-3/5 mt-1.5" />}
                {s.status === 'done' && s.detail && <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>}
                {s.status === 'failed' && run.error && <p className="text-xs text-critical-ink mt-0.5">{run.error.code} · {run.error.message}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function RunHeadline({ run, firstMeter }: { run: AnalysisRun; firstMeter?: string }) {
  const s = run.summary;
  if (!s) return null;
  const [head, tail] = s.headline.split(', ');
  return (
    <Card className="fade-in">
      <CardContent className="flex items-center gap-6 flex-wrap">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Resultado del análisis</p>
          <div className="display-lg">{head}{tail && <span className="text-muted-foreground"> · {tail}</span>}</div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            {(['HIGH', 'MEDIUM', 'LOW'] as const).filter(k => s.by_severity[k]).map(k => <span key={k} className="flex items-center gap-1"><SeverityBadge severity={k} /><span className="num text-foreground font-semibold">{s.by_severity[k]}</span></span>)}
            <span>· confianza media <span className="num text-foreground font-semibold">{Math.round(s.avg_confidence * 100)} %</span></span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button nativeButton={false} render={<Link to="/anomalies" />}>Ver anomalías →</Button>
          {firstMeter && <Button variant="outline" nativeButton={false} render={<Link to={`/meters/${firstMeter}`} />}>Ver {firstMeter}</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

export function RunError({ run, onRetry }: { run: AnalysisRun; onRetry: () => void }) {
  if (!run.error) return null;
  return (
    <Alert variant="destructive">
      <OctagonAlert />
      <AlertTitle>{run.error.code} · {run.error.message}</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>Las anomalías del análisis anterior siguen vigentes.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>
      </AlertDescription>
    </Alert>
  );
}
