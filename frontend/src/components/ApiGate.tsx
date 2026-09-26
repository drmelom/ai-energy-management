import { useEffect, useState, type ReactNode } from 'react';
import { Zap } from 'lucide-react';
import { api } from '../api/client';

/**
 * Waits for the API before rendering the app. On a free host the backend may be asleep
 * (cold start ~50 s): instead of a fetch error the user sees a "waking up" screen that retries.
 */
export function ApiGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const ping = async () => {
      try {
        await api.health();
        if (alive) setReady(true);
      } catch {
        if (!alive) return;
        setAttempts(a => a + 1);
        timer = window.setTimeout(ping, 3000);
      }
    };
    void ping();
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, []);
  if (ready) return <>{children}</>;
  return (
    <div className="min-h-full grid place-items-center p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <span className="size-12 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Zap className="size-6" /></span>
        <div>
          <p className="eyebrow">AI Energy Management</p>
          <h1 className="display mt-1">{attempts === 0 ? 'Conectando…' : 'Encendiendo el servidor'}</h1>
        </div>
        {attempts > 0 && (
          <p className="text-muted-foreground">
            La API está en un plan gratuito y se apaga sin tráfico. Se está encendiendo, suele tardar menos de un minuto.
            <br /><span className="num text-xs">reintento {attempts} · cada 3 s</span>
          </p>
        )}
        <span className="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden />
      </div>
    </div>
  );
}
