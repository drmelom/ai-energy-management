import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { api, useQuery } from '../api/client';
import { AnalysisStepper, RunError, RunHeadline } from '../components/AnalysisStepper';
import { AppShell } from '../components/AppShell';
import { fmtBogota } from '../lib/fmt';
import { useRun } from '../state/run';

export default function Analysis() {
  const { run, active, start, version } = useRun();
  const [force, setForce] = useState(true);
  const [busy, setBusy] = useState(false);
  const anomalies = useQuery(() => (run?.status === 'COMPLETED' ? api.anomalies({ run_id: run.id }) : Promise.resolve(null)), [run?.id, run?.status, version]);
  const degraded = !!anomalies.data?.items.some(a => (a.providers.decision === 'rules' && run?.providers.decision === 'jev') || (a.providers.explanation === 'template' && run?.providers.explanation === 'llm'));
  const go = async () => { setBusy(true); try { await start(force); } finally { setBusy(false); } };

  return (
    <AppShell title="Análisis IA">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-muted-foreground max-w-[70ch]">Lecturas → Baseline → Detección → Correlación → Eventos → Explicación → Recomendación. Las cinco primeras etapas son analítica determinista; la IA clasifica tipo, severidad y prioridad y redacta la explicación citando solo cifras de la evidencia.</p>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <Label className="flex items-center gap-2 text-xs text-muted-foreground font-normal" title="Desactivado: reutiliza respuestas de IA ya calculadas para la misma evidencia (caché por hash). Activado: siempre llama a los proveedores en vivo.">
            <Checkbox checked={force} onCheckedChange={v => setForce(v === true)} />Llamar a la IA en vivo (sin caché)
          </Label>
          <Button onClick={go} disabled={active || busy} aria-busy={active}>
            {active ? <><span className="size-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />Analizando…</> : <><Play />Ejecutar análisis IA</>}
          </Button>
        </div>
      </div>
      {run?.status === 'COMPLETED' && <RunHeadline run={run} firstMeter={anomalies.data?.items[0]?.meter_id} />}
      {run?.status === 'FAILED' && <RunError run={run} onRetry={go} />}
      {run ? (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>Iniciado {fmtBogota(run.started_at)}</span>{run.finished_at && <span>· finalizado {fmtBogota(run.finished_at)}</span>}<span>· hora Colombia</span>
            {!run.force_refresh && <span>· con caché</span>}
            {degraded && <span className="text-warning-ink">· en algún caso se usó el respaldo determinista (punto ámbar en Explicación)</span>}
          </div>
          <AnalysisStepper run={run} degraded={degraded} />
        </>
      ) : (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Aún no se ha ejecutado ningún análisis. Pulsa <b>Ejecutar análisis IA</b> para procesar las 4.032 lecturas.</CardContent></Card>
      )}
    </AppShell>
  );
}
