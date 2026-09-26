import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AnalysisRun } from '../api/types';

interface RunState {
  run: AnalysisRun | null;         // the run being watched (active or last)
  active: boolean;                 // QUEUED | RUNNING
  start: (forceRefresh?: boolean) => Promise<string>;
  version: number;                 // bumps when a run completes → pages refetch
  providers: { decision: string; explanation: string } | null;
}

const Ctx = createContext<RunState | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [version, setVersion] = useState(0);
  const [providers, setProviders] = useState<RunState['providers']>(null);
  const timer = useRef<number | null>(null);

  const stop = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };

  const watch = useCallback((id: string) => {
    stop();
    const tick = async () => {
      try {
        const r = await api.run(id);
        setRun(r);
        if (r.status === 'COMPLETED' || r.status === 'FAILED') { stop(); setVersion(v => v + 1); }
      } catch { stop(); }
    };
    void tick();
    timer.current = window.setInterval(tick, 700);
  }, []);

  useEffect(() => {
    api.health().then(h => setProviders(h.providers)).catch(() => undefined);
    api.runs(1).then(({ items }) => {
      const last = items[0];
      if (!last) return;
      if (last.status === 'QUEUED' || last.status === 'RUNNING') watch(last.id);
      else api.run(last.id).then(setRun).catch(() => undefined);
    }).catch(() => undefined);
    return stop;
  }, [watch]);

  const start = useCallback(async (forceRefresh = true) => {
    const acc = await api.analyze(forceRefresh);
    watch(acc.analysis_id);
    return acc.analysis_id;
  }, [watch]);

  const active = !!run && (run.status === 'QUEUED' || run.status === 'RUNNING');
  return <Ctx.Provider value={{ run, active, start, version, providers }}>{children}</Ctx.Provider>;
}

export function useRun(): RunState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRun outside RunProvider');
  return v;
}
