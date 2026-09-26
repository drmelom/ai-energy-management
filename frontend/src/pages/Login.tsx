import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Icon } from '../components/Icon';

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
    <div className="min-h-full grid place-items-center p-6">
      <form onSubmit={submit} className="card w-[400px] max-w-full p-8 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-accent-ink text-white grid place-items-center"><Icon name="bolt" size={20} /></span>
          <div><div className="text-lg font-semibold leading-6">AI Energy Management</div><div className="text-xs text-ink-2">Plataforma de gestión de medidores con IA</div></div>
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-2">Usuario
          <input className="input text-sm" value={user} onChange={e => setUser(e.target.value)} placeholder="admin" autoComplete="username" required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">Contraseña
          <input className="input text-sm" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="admin" autoComplete="current-password" required />
        </label>
        {error && <p className="text-critical-ink text-xs" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary justify-center mt-1" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-xs text-ink-3 text-center">Acceso demo · usuario <b>admin</b> · contraseña <b>admin</b></p>
      </form>
    </div>
  );
}
