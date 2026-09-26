import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '../api/client';

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
    <div className="min-h-full grid place-items-center p-6 bg-[radial-gradient(ellipse_at_top,var(--brand-wash),transparent_60%)]">
      <Card className="w-[400px] max-w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Zap className="size-5" /></span>
            <div><CardTitle className="text-lg">AI Energy Management</CardTitle><CardDescription>Plataforma de gestión de medidores con IA</CardDescription></div>
          </div>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-1.5"><Label htmlFor="user">Usuario</Label><Input id="user" value={user} onChange={e => setUser(e.target.value)} placeholder="admin" autoComplete="username" required /></div>
            <div className="grid gap-1.5"><Label htmlFor="pass">Contraseña</Label><Input id="pass" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="admin" autoComplete="current-password" required /></div>
            {error && <p className="text-critical-ink text-xs" role="alert">{error}</p>}
          </CardContent>
          <CardFooter className="flex-col gap-3 mt-4">
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
            <p className="text-xs text-muted-foreground text-center">Acceso demo · usuario <b>admin</b> · contraseña <b>admin</b></p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
