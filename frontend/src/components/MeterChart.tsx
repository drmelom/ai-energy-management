import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtDay, fmtKwh, fmtNum, fmtPct, fmtTs, fmtV, fmtA, fmtPF } from '../lib/fmt';
import { dayTicks, voltageDomain, yMaxRound, type ChartPoint, type EventMark, type SegmentMark } from '../lib/shape';
import { prefersReducedMotion } from '../lib/motion';

// Series draw in on mount (and on data change); off for users who prefer reduced motion.
const anim = () => ({ isAnimationActive: !prefersReducedMotion(), animationDuration: 900, animationEasing: 'ease-out' as const });

const MARGIN = { top: 20, right: 16, bottom: 4, left: 8 };
const tick = { fill: 'var(--muted-foreground)', fontSize: 12 };
const axisLine = { stroke: 'var(--axis)' };

type Row = { name: string; value: string; color?: string; strong?: boolean; tone?: string };

function TooltipBox({ active, payload, rows }: { active?: boolean; payload?: { payload: ChartPoint }[]; rows: (p: ChartPoint) => Row[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md" style={{ minWidth: 180 }}>
      <div className="text-muted-foreground mb-1">{fmtTs(p.t)}</div>
      {rows(p).map(r => (
        <div key={r.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">{r.color && <span aria-hidden style={{ width: 12, height: 2, background: r.color }} />}{r.name}</span>
          <span className={`num ${r.strong ? 'font-semibold' : ''} ${r.tone ?? 'text-foreground'}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function SegmentLabel({ viewBox, seg }: { viewBox?: { x: number; y: number; width: number }; seg: SegmentMark }) {
  if (!viewBox) return null;
  return (
    <text x={viewBox.x + viewBox.width - 4} y={viewBox.y + 12} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--foreground)">
      {seg.label}{seg.pct != null ? ` ${fmtPct(seg.pct)}` : ''}
    </text>
  );
}
function EventFlag({ viewBox, ev }: { viewBox?: { x: number; y: number }; ev: EventMark }) {
  if (!viewBox) return null;
  return (
    <g transform={`translate(${viewBox.x + 3},${viewBox.y + 2})`}>
      <path d="M0 0v10 M0 0h7l-1.5 2.5L7 5H0" stroke="var(--foreground)" strokeWidth={1.2} fill="var(--foreground)" />
      <text x={10} y={8} fontSize={11} fill="var(--muted-foreground)">{ev.type}</text>
    </g>
  );
}

const Marks = ({ segment, events, flags = true }: { segment?: SegmentMark; events: EventMark[]; flags?: boolean }) => (
  <>
    {segment && <ReferenceArea x1={segment.x1} x2={segment.x2} fill={segment.color} fillOpacity={0.12} ifOverflow="extendDomain" label={flags ? <SegmentLabel seg={segment} /> : undefined} />}
    {events.map(e => <ReferenceLine key={e.x} x={e.x} stroke="var(--foreground)" strokeWidth={1} ifOverflow="extendDomain" label={flags ? <EventFlag ev={e} /> : undefined} />)}
  </>
);

export function MeterChart({ points, resolution, segment, events, syncId, height = 320 }: {
  points: ChartPoint[]; resolution: 'hourly' | 'daily'; segment?: SegmentMark; events: EventMark[]; syncId?: string; height?: number;
}) {
  const daily = resolution === 'daily';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={MARGIN} syncId={syncId}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={dayTicks(points)} tickFormatter={fmtDay} tick={tick} axisLine={axisLine} tickLine={false} />
        <YAxis domain={[0, yMaxRound]} tick={tick} axisLine={false} tickLine={false} tickFormatter={v => fmtNum(v, 0)} width={44} />
        <Area dataKey="band" stroke="none" fill="var(--band)" {...anim()} activeDot={false} legendType="none" />
        <Line dataKey="baseline" stroke="var(--baseline)" strokeWidth={2} dot={false} {...anim()} activeDot={false} />
        <Area dataKey="kwh" stroke="none" fill="var(--brand-wash)" {...anim()} activeDot={false} />
        <Line dataKey="kwh" stroke="var(--brand)" strokeWidth={2} dot={daily ? { r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: 'var(--brand)' } : false} {...anim()} />
        <Marks segment={segment} events={events} />
        <Tooltip cursor={{ stroke: 'var(--axis)' }} content={<TooltipBox rows={(p: ChartPoint) => {
          const inWin = segment && p.t >= segment.x1 && p.t < segment.x2;
          return [
            { name: 'Consumo', value: fmtKwh(p.kwh, daily ? 1 : 2), color: 'var(--brand)', strong: true },
            { name: 'Baseline', value: fmtKwh(p.baseline, daily ? 1 : 2), color: 'var(--baseline)' },
            { name: 'Desvío', value: fmtPct(p.dev), tone: Math.abs(p.dev) >= 25 ? 'text-critical-ink font-semibold' : undefined },
            ...(inWin ? [{ name: 'Ventana', value: 'dentro de la ventana anómala', tone: 'text-muted-foreground' }] : []),
          ];
        }} />} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const SmallAxis = ({ points, last }: { points: ChartPoint[]; last: boolean }) => (
  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={dayTicks(points)} tickFormatter={fmtDay} tick={last ? tick : false} axisLine={axisLine} tickLine={false} height={last ? 24 : 4} />
);

export function ElectricalCharts({ points, segment, events, syncId }: { points: ChartPoint[]; segment?: SegmentMark; events: EventMark[]; syncId?: string }) {
  const [vLo, vHi] = voltageDomain(points);
  const common = { data: points, margin: MARGIN, syncId };
  const H = 120;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted-foreground pl-2">Tensión (V) · eje acotado {vLo}–{vHi} V · zonas sombreadas = fuera de ±5 % de 220 V</div>
      <ResponsiveContainer width="100%" height={H}>
        <ComposedChart {...common}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <SmallAxis points={points} last={false} />
          <YAxis domain={[vLo, vHi]} ticks={[209, 220, 231]} tick={tick} axisLine={false} tickLine={false} width={44} />
          <ReferenceArea y1={231} y2={vHi} fill="var(--critical)" fillOpacity={0.08} />
          <ReferenceArea y1={vLo} y2={209} fill="var(--critical)" fillOpacity={0.08} />
          <ReferenceLine y={220} stroke="var(--axis)" strokeWidth={1} />
          <Marks segment={segment} events={events} flags={false} />
          <Line dataKey="baseline_v" stroke="var(--baseline)" strokeWidth={1.5} dot={false} {...anim()} activeDot={false} />
          <Line dataKey="v" stroke="var(--muted-foreground)" strokeWidth={1.5} dot={false} {...anim()} />
          <Tooltip cursor={{ stroke: 'var(--axis)' }} content={<TooltipBox rows={(p: ChartPoint) => [
            { name: 'Tensión', value: fmtV(p.v), color: 'var(--muted-foreground)', strong: true, tone: p.v < 209 || p.v > 231 ? 'text-critical-ink font-semibold' : undefined },
            ...(p.baseline_v != null ? [{ name: 'Baseline', value: fmtV(p.baseline_v), color: 'var(--baseline)' }] : []),
          ]} />} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-xs text-muted-foreground pl-2">Corriente (A)</div>
      <ResponsiveContainer width="100%" height={H}>
        <ComposedChart {...common}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <SmallAxis points={points} last={false} />
          <YAxis domain={[0, 'auto']} tick={tick} axisLine={false} tickLine={false} tickFormatter={v => fmtNum(v, 0)} width={44} />
          <Marks segment={segment} events={events} flags={false} />
          <Line dataKey="baseline_i" stroke="var(--baseline)" strokeWidth={1.5} dot={false} {...anim()} activeDot={false} />
          <Line dataKey="i" stroke="var(--muted-foreground)" strokeWidth={1.5} dot={false} {...anim()} />
          <Tooltip cursor={{ stroke: 'var(--axis)' }} content={<TooltipBox rows={(p: ChartPoint) => [
            { name: 'Corriente', value: fmtA(p.i), color: 'var(--muted-foreground)', strong: true },
            ...(p.baseline_i != null ? [{ name: 'Baseline', value: fmtA(p.baseline_i), color: 'var(--baseline)' }] : []),
          ]} />} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="text-xs text-muted-foreground pl-2">Factor de potencia · eje fijo 0,5–1,0 · zona sombreada = PF &lt; 0,80</div>
      <ResponsiveContainer width="100%" height={H + 20}>
        <ComposedChart {...common}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <SmallAxis points={points} last />
          <YAxis domain={[0.5, 1]} ticks={[0.5, 0.8, 1]} tick={tick} axisLine={false} tickLine={false} tickFormatter={fmtPF} width={44} />
          <ReferenceArea y1={0.5} y2={0.8} fill="var(--critical)" fillOpacity={0.08} />
          <ReferenceLine y={0.8} stroke="var(--axis)" strokeWidth={1} />
          <Marks segment={segment} events={events} flags={false} />
          <Line dataKey="baseline_pf" stroke="var(--baseline)" strokeWidth={1.5} dot={false} {...anim()} activeDot={false} />
          <Line dataKey="pf" stroke="var(--muted-foreground)" strokeWidth={1.5} dot={false} {...anim()} />
          <Tooltip cursor={{ stroke: 'var(--axis)' }} content={<TooltipBox rows={(p: ChartPoint) => [
            { name: 'Factor de potencia', value: fmtPF(p.pf), color: 'var(--muted-foreground)', strong: true, tone: p.pf < 0.8 ? 'text-critical-ink font-semibold' : undefined },
            ...(p.baseline_pf != null ? [{ name: 'Baseline', value: fmtPF(p.baseline_pf), color: 'var(--baseline)' }] : []),
          ]} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReadingsTable({ points }: { points: ChartPoint[] }) {
  return (
    <table className="w-full text-xs [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:border-t [&_td]:border-border">
      <thead><tr><th>Hora</th><th style={{ textAlign: 'right' }}>kWh</th><th style={{ textAlign: 'right' }}>Baseline</th><th style={{ textAlign: 'right' }}>Desvío</th><th style={{ textAlign: 'right' }}>V</th><th style={{ textAlign: 'right' }}>A</th><th style={{ textAlign: 'right' }}>PF</th></tr></thead>
      <tbody>
        {points.map(p => (
          <tr key={p.t} style={{ height: 28 }}>
            <td>{fmtTs(p.t)}</td><td className="num text-right">{fmtNum(p.kwh, 2)}</td><td className="num text-right">{fmtNum(p.baseline, 2)}</td>
            <td className="num text-right">{fmtPct(p.dev)}</td><td className="num text-right">{fmtNum(p.v, 1)}</td><td className="num text-right">{fmtNum(p.i, 0)}</td><td className="num text-right">{fmtPF(p.pf)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
