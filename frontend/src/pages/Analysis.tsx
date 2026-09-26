import { useState } from 'react';
import { api, useQuery } from '../api/client';
import { AnalysisStepper, RunError, RunHeadline } from '../components/AnalysisStepper';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { ProviderBadge } from '../components/ProviderBadge';
import { fmtIso } from '../lib/fmt';
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
        <p className="text-ink-2 max-w-[70ch]">Lecturas → Baseline → Detección → Correlación → Eventos → Explicación → Recomendación. Las cinco primeras etapas son analítica determinista; Jev decide el tipo, la severidad y la prioridad; un LLM redacta la explicación citando solo cifras de la evidencia.</p>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-ink-2" title="Desactivado: reutiliza respuestas de IA ya calculadas para la misma evidencia (caché por hash). Activado: siempre llama a los proveedores en vivo.">
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />Llamar a la IA en vivo (sin caché)
          </label>
          <button type="button" className="btn btn-primary" onClick={go} disabled={active || busy} aria-busy={active}>
            {active ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white spin" aria-hidden />Analizando…</> : <><Icon name="play" size={13} />Ejecutar análisis IA</>}
          </button>
        </div>
      </div>
      {run?.status === 'COMPLETED' && <RunHeadline run={run} firstMeter={anomalies.data?.items[0]?.meter_id} />}
      {run?.status === 'FAILED' && <RunError run={run} onRetry={go} />}
      {run ? (
        <>
          <div className="flex items-center gap-2 text-xs text-ink-2 flex-wrap">
            <ProviderBadge kind="decision" provider={run.providers.decision} /><ProviderBadge kind="explanation" provider={run.providers.explanation} />
            <span>· iniciado {fmtIso(run.started_at)} UTC</span>{run.finished_at && <span>· finalizado {fmtIso(run.finished_at)} UTC</span>}
            {!run.force_refresh && <span>· con caché</span>}
            {degraded && <span className="text-warning-ink">· algún proveedor cayó a fallback (punto ámbar en Explicación)</span>}
          </div>
          <AnalysisStepper run={run} degraded={degraded} />
        </>
      ) : (
        <div className="card p-8 text-center text-ink-2">Aún no se ha ejecutado ningún análisis. Pulsa <b>Ejecutar análisis IA</b> para procesar las 4.032 lecturas.</div>
      )}
    </AppShell>
  );
}
