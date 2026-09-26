import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, useQuery } from '../api/client';
import type { GraphNode, StageProgress } from '../api/types';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/Badge';
import { fmtDur, parseNaive } from '../lib/fmt';
import { useRun } from '../state/run';

const W = 150, H = 64, GAP = 34;
const dur = (s?: StageProgress) => (s?.started_at && s.finished_at ? (parseNaive(s.finished_at) - parseNaive(s.started_at)) / 1000 : null);

function FlowSvg({ nodes, stages }: { nodes: GraphNode[]; stages?: StageProgress[] | null }) {
  const width = nodes.length * W + (nodes.length - 1) * GAP;
  return (
    <svg viewBox={`0 0 ${width} ${H + 30}`} className="w-full h-auto" role="img" aria-label={`Grafo lineal de ${nodes.length} nodos: ${nodes.map(n => n.label).join(' → ')}`}>
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted-foreground)" /></marker></defs>
      {nodes.map((n, i) => {
        const x = i * (W + GAP);
        const ai = n.kind === 'ai';
        const st = stages?.find(s => s.key === n.key);
        const d = dur(st);
        return (
          <g key={n.key}>
            {i < nodes.length - 1 && <line x1={x + W} y1={H / 2} x2={x + W + GAP - 2} y2={H / 2} stroke="var(--muted-foreground)" strokeWidth={1.5} markerEnd="url(#arrow)" />}
            <rect x={x} y={0} width={W} height={H} rx={10} fill={ai ? 'var(--brand-wash)' : 'var(--card)'} stroke={ai ? 'var(--brand)' : 'var(--border)'} strokeWidth={ai ? 2 : 1} />
            <text x={x + 12} y={22} fontSize={11} fill="var(--muted-foreground)" style={{ fontFamily: 'var(--font-mono)' }}>{String(i + 1).padStart(2, '0')} · {n.kind === 'ai' ? 'IA' : 'determinista'}</text>
            <text x={x + 12} y={44} fontSize={15} fontWeight={600} fill="var(--foreground)" style={{ fontFamily: 'var(--font-display)' }}>{n.label}</text>
            {d != null && <text x={x + W - 12} y={H + 20} fontSize={11} textAnchor="end" fill="var(--muted-foreground)" style={{ fontFamily: 'var(--font-mono)' }}>{fmtDur(d)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function Pipeline() {
  const g = useQuery(() => api.graph(), []);
  const { run } = useRun();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(g.data?.mermaid ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <AppShell title="Pipeline de análisis">
      <p className="text-muted-foreground max-w-[80ch]">Grafo real de LangGraph tal como está compilado en el backend, leído de <span className="num">GET /ai/graph</span>. Un nodo por etapa del enunciado; el progreso que ves en "Análisis IA" es la ejecución de estos nodos. Solo el nodo 6 llama a modelos de IA; los demás son código determinista y testeable.</p>
      {g.error && <p className="text-critical-ink">{g.error.message}</p>}
      {!g.data ? <Skeleton className="h-40 rounded-xl" /> : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Flujo</CardTitle>
              <CardDescription>{g.data.nodes.length} nodos · {g.data.edges.length} aristas{run?.status === 'COMPLETED' ? ' · tiempos del último análisis' : ''}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto"><div className="min-w-[1040px]"><FlowSvg nodes={g.data.nodes} stages={run?.stages} /></div></CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.data.nodes.map((n, i) => (
              <Card key={n.key} className={n.kind === 'ai' ? 'border-brand' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="num text-muted-foreground text-xs">{String(i + 1).padStart(2, '0')}</span>
                    <CardTitle className="text-lg">{n.label}</CardTitle>
                    <span className="ml-auto"><Badge tone={n.kind === 'ai' ? 't-real' : 'neutral'}>{n.kind === 'ai' ? 'IA' : 'determinista'}</Badge></span>
                  </div>
                  <CardDescription className="num text-[11px]">{n.key} · {n.tech}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm flex flex-col gap-2">
                  <p>{n.description}</p>
                  <p className="text-xs text-muted-foreground">Produce: <span className="num text-foreground">{n.outputs.join(', ')}</span></p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div><CardTitle className="text-lg">Mermaid generado por LangGraph</CardTitle><CardDescription>Salida literal de <span className="num">graph.get_graph().draw_mermaid()</span>; se puede pegar en mermaid.live.</CardDescription></div>
              <Button variant="outline" size="sm" onClick={copy}>{copied ? <><Check />Copiado</> : <><Copy />Copiar</>}</Button>
            </CardHeader>
            <CardContent><pre className="num text-xs bg-muted/60 rounded-md p-3 overflow-x-auto whitespace-pre">{g.data.mermaid}</pre></CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
