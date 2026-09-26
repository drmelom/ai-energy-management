import { useCallback, useEffect, useRef, useState } from 'react';
import type * as T from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

async function call<R>(method: string, path: string, body?: unknown): Promise<R> {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code = 'HTTP_ERROR', message = res.statusText;
    try { const j = await res.json(); code = j.error?.code ?? code; message = j.error?.message ?? message; } catch { /* keep defaults */ }
    throw new ApiError(res.status, code, message);
  }
  return res.json() as Promise<R>;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export const api = {
  login: (username: string, password: string) => call<{ token: string; user: { name: string } }>('POST', '/auth/login', { username, password }),
  health: () => call<T.Health>('GET', '/health'),
  dashboard: () => call<T.DashboardSummary>('GET', '/dashboard/summary'),
  meters: (p: { status?: string; search?: string; sort?: string; order?: string } = {}) => call<T.MeterList>('GET', `/meters${qs(p)}`),
  meter: (id: string) => call<T.MeterDetail>('GET', `/meters/${id}`),
  readings: (id: string, p: { from?: string; to?: string; resolution?: string; include_baseline?: boolean } = {}) =>
    call<T.ReadingsOut>('GET', `/meters/${id}/readings${qs(p)}`),
  meterEvents: (id: string) => call<{ items: T.EventOut[] }>('GET', `/meters/${id}/events`),
  anomalies: (p: { run_id?: string; severity?: string; type?: string; status?: string; priority?: boolean; sort?: string } = {}) =>
    call<T.AnomalyList>('GET', `/anomalies${qs(p)}`),
  anomaly: (id: number | string) => call<T.AnomalyDetail>('GET', `/anomalies/${id}`),
  patchAnomaly: (id: number, status: string) => call<T.AnomalySummary>('PATCH', `/anomalies/${id}`, { status }),
  analyze: (force_refresh = true) => call<T.AnalyzeAccepted>('POST', '/ai/analyze', { force_refresh }),
  run: (id: string) => call<T.AnalysisRun>('GET', `/ai/analysis/${id}`),
  runs: (limit = 5) => call<{ items: T.AnalysisRun[] }>('GET', `/ai/analysis${qs({ limit })}`),
};

export type QueryState<R> = { data: R | null; error: ApiError | null; loading: boolean; refetch: () => void };

/** Minimal fetch hook: keeps previous data while refetching (no layout jump), re-runs when `deps` change. */
export function useQuery<R>(fn: () => Promise<R>, deps: unknown[]): QueryState<R> {
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnRef.current().then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const refetch = useCallback(() => setTick(t => t + 1), []);
  return { data, error, loading, refetch };
}
