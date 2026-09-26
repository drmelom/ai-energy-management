import type { AnomalyDetail, BaselineHour, EventOut, ReadingsOut } from '../api/types';
import { HOUR, hourOf, parseNaive } from './fmt';
import { SEVERITY, TYPE, type AnomalyType, type Severity } from './semantics';

export const BAND = 0.25; // detector threshold (ARCHITECTURE §6.2): outside the band = what the AI flagged

export interface ChartPoint {
  t: number; kwh: number; baseline: number; band: [number, number]; dev: number;
  v: number; i: number; pf: number; baseline_v?: number; baseline_i?: number; baseline_pf?: number;
}

export function toChartPoints(r: ReadingsOut, profile?: BaselineHour[]): ChartPoint[] {
  const byHour = profile ? Object.fromEntries(profile.map(h => [h.hour, h])) : undefined;
  const daily = r.resolution === 'daily';
  return r.points.map(p => {
    const h = byHour?.[hourOf(p.timestamp)];
    const b = p.baseline_kwh ?? h?.kwh ?? NaN;
    const avg = (k: keyof BaselineHour) => (profile && daily ? profile.reduce((s, x) => s + (x[k] as number), 0) / profile.length : undefined);
    return {
      t: parseNaive(p.timestamp), kwh: p.consumption_kwh, baseline: b, band: [b * (1 - BAND), b * (1 + BAND)],
      dev: p.deviation_pct ?? ((p.consumption_kwh - b) / b) * 100, v: p.voltage_v, i: p.current_a, pf: p.power_factor,
      baseline_v: daily ? avg('voltage_v') : h?.voltage_v, baseline_i: daily ? avg('current_a') : h?.current_a, baseline_pf: daily ? avg('power_factor') : h?.power_factor,
    };
  });
}

export const dayTicks = (pts: ChartPoint[]) => pts.filter(p => new Date(p.t).getHours() === 0).map(p => p.t);

export interface SegmentMark { x1: number; x2: number; severity: Severity; type: AnomalyType; pct: number | null; color: string; label: string }
export const segmentBounds = (a: Pick<AnomalyDetail, 'window' | 'severity' | 'type' | 'evidence'>): SegmentMark => {
  const dev = a.evidence.find(e => e.kind === 'CONSUMPTION_DEVIATION')?.deviation_pct ?? null;
  return {
    x1: parseNaive(a.window.from), x2: parseNaive(a.window.to) + HOUR, severity: a.severity, type: a.type, pct: dev,
    color: `var(--${SEVERITY[a.severity].tone})`, label: TYPE[a.type].short,
  };
};

export interface EventMark { x: number; type: string; description: string }
export const eventMarks = (evs: EventOut[]): EventMark[] => evs.map(e => ({ x: parseNaive(e.timestamp), type: e.type, description: e.description }));

export const yMaxRound = (max: number) => Math.max(25, Math.ceil(max / 25) * 25);
export const voltageDomain = (pts: ChartPoint[]): [number, number] => {
  const vs = pts.map(p => p.v);
  return [Math.min(205, Math.floor(Math.min(...vs)) - 3), Math.max(235, Math.ceil(Math.max(...vs)) + 3)];
};
