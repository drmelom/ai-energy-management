import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisRun, StageProgress } from '../api/types';
import { fmtDur, parseNaive } from '../lib/fmt';
import { SeverityBadge } from './Badge';
import { Icon } from './Icon';

const dur = (s: StageProgress) => (s.started_at && s.finished_at ? (parseNaive(s.finished_at) - parseNaive(s.started_at)) / 1000 : null);

function Glyph({ status, degraded }: { status: StageProgress['status']; degraded?: boolean }) {
  const base = 'w-5 h-5 rounded-full grid place-items-center shrink-0';
  if (status === 'done') return <span className={`${base} bg-ok text-white relative`}><Icon name="check" size={12} />{degraded && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-warning ring-2 ring-surface" />}</span>;
  if (status === 'running') return <span className={`${base} border-2 border-accent border-t-transparent spin`} aria-label="en curso" />;
  if (status === 'failed') return <span className={`${base} bg-critical text-white`}><Icon name="x" size={12} /></span>;
  return <span className={`${base} border-2 border-axis`} />;
}

function LiveSeconds() {
  // Counts from the moment the stage was first seen running on this client (server clock is UTC; we avoid mixing clocks).
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  return <span className="num text-ink-3 text-xs">{fmtDur((now - start) / 1000)}</span>;
}

export function AnalysisStepper({ run, degraded }: { run: AnalysisRun; degraded?: boolean }) {
  const stages = run.stages ?? [];
  return (
    <ol aria-live="polite" className="card p-4 flex flex-col">
      {stages.map((s, i) => (
        <li key={s.key} className="flex items-start gap-3 relative">
          {i < stages.length - 1 && <span aria-hidden className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />}
          <Glyph status={s.status} degraded={s.key === 'explanation' && degraded} />
          <div className="flex-1 min-w-0 pb-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`${s.status === 'pending' ? 'text-ink-3' : s.status === 'failed' ? 'text-critical-ink' : 'text-ink'} ${s.status === 'running' ? 'font-semibold' : ''}`}>{s.label}</span>
              {s.status === 'done' && dur(s) != null && <span className="num text-ink-3 text-xs">{fmtDur(dur(s)!)}</span>}
              {s.status === 'running' && <LiveSeconds key={s.key} />}
            </div>
            {s.status === 'running' && <div className="skeleton h-3 w-3/5 mt-1.5" />}
            {s.status === 'done' && s.detail && <p className="text-xs text-ink-2 mt-0.5">{s.detail}</p>}
            {s.status === 'failed' && run.error && <p className="text-xs text-critical-ink mt-0.5">{run.error.code} · {run.error.message}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RunHeadline({ run, firstMeter }: { run: AnalysisRun; firstMeter?: string }) {
  const s = run.summary;
  if (!s) return null;
  const [head, tail] = s.headline.split(', ');
  return (
    <div className="card p-4 fade-in flex items-center gap-6 flex-wrap">
      <div className="min-w-0">
        <div className="display">{head}{tail && <span className="text-ink-2 font-normal"> · {tail}</span>}</div>
        <div className="flex items-center gap-3 mt-2 text-xs text-ink-2 flex-wrap">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).filter(k => s.by_severity[k]).map(k => <span key={k} className="flex items-center gap-1"><SeverityBadge severity={k} /><span className="num text-ink font-semibold">{s.by_severity[k]}</span></span>)}
          <span>· confianza media <span className="num text-ink font-semibold">{Math.round(s.avg_confidence * 100)} %</span></span>
        </div>
      </div>
      <div className="ml-auto flex gap-2">
        <Link className="btn btn-primary no-underline" to="/anomalies">Ver anomalías →</Link>
        {firstMeter && <Link className="btn btn-secondary no-underline" to={`/meters/${firstMeter}`}>Ver {firstMeter}</Link>}
      </div>
    </div>
  );
}

export function RunError({ run, onRetry }: { run: AnalysisRun; onRetry: () => void }) {
  if (!run.error) return null;
  return (
    <div className="rounded-[8px] p-4 bg-critical-wash text-critical-ink flex items-center gap-3">
      <Icon name="octagon-alert" size={18} />
      <div className="flex-1"><b>{run.error.code}</b> · {run.error.message}<div className="text-xs mt-0.5 opacity-80">Las anomalías del análisis anterior siguen vigentes.</div></div>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>Reintentar</button>
    </div>
  );
}
