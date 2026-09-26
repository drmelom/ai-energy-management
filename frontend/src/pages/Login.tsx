import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '../api/client';

const STEPS = ['Datos', 'Análisis', 'Anomalía', 'Explicación', 'Priorización', 'Acción'];

export default function Login() {
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.login(user, pass);
      try { sessionStorage.setItem('token', r.token); } catch { /* ignore */ }
      nav('/');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Usuario o contraseña incorrectos.' : 'No se pudo conectar con el servidor.');
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-full grid lg:grid-cols-[1.2fr_1fr]">
      <section className="hidden lg:flex flex-col justify-between p-12 border-r border-border relative overflow-hidden">
        <div className="flex items-center gap-3">
          <span className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center"><Zap className="size-4" /></span>
          <span className="eyebrow text-foreground">AI Energy Management · MVP</span>
        </div>
        <div className="stagger">
          <p className="eyebrow mb-4">Plataforma de gestión de medidores</p>
          <h1 className="display-lg max-w-[14ch]">Convertir 4.032 lecturas en <em className="not-italic text-primary">una decisión</em> operativa.</h1>
          <ol className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-3 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="num text-muted-foreground text-xs">{String(i + 1).padStart(2, '0')}</span>
                <span className={i === 2 || i === 5 ? 'font-semibold' : 'text-muted-foreground'}>{s}</span>
                {i < STEPS.length - 1 && <ArrowRight className="size-3.5 text-muted-foreground/60" />}
              </li>
            ))}
          </ol>
        </div>
        <dl className="grid grid-cols-3 gap-6 max-w-md">
          {[['12', 'medidores'], ['14', 'días'], ['4', 'anomalías IA']].map(([v, l]) => (
            <div key={l} className="rule-top pt-2"><dt className="eyebrow">{l}</dt><dd className="display mt-1">{v}</dd></div>
          ))}
        </dl>
        <span aria-hidden className="absolute -right-24 -bottom-24 size-[420px] rounded-full border border-primary/15" />
        <span aria-hidden className="absolute -right-8 -bottom-8 size-[220px] rounded-full border border-primary/25" />
      </section>
      <section className="grid place-items-center p-6 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-5 stagger">
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <span className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center"><Zap className="size-4" /></span>
            <span className="font-semibold">AI Energy Management</span>
          </div>
          <div>
            <p className="eyebrow">Acceso</p>
            <h2 className="display mt-1">Iniciar sesión</h2>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="user">Usuario</Label><Input id="user" className="h-10" value={user} onChange={e => setUser(e.target.value)} placeholder="admin" autoComplete="username" required /></div>
          <div className="grid gap-1.5"><Label htmlFor="pass">Contraseña</Label><Input id="pass" className="h-10" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="admin" autoComplete="current-password" required /></div>
          {error && <p className="text-critical-ink text-xs" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}<ArrowRight /></Button>
          <p className="text-xs text-muted-foreground">Acceso demo · usuario <span className="num text-foreground">admin</span> · contraseña <span className="num text-foreground">admin</span></p>
        </form>
      </section>
    </div>
  );
}
