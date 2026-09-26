import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useRun } from '../state/run';
import { Icon } from './Icon';
import { ProviderBadge } from './ProviderBadge';
import type { IconName } from '../lib/semantics';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Dashboard', icon: 'grid' },
  { to: '/meters', label: 'Medidores', icon: 'list' },
  { to: '/anomalies', label: 'Anomalías IA', icon: 'siren' },
  { to: '/analysis', label: 'Análisis IA', icon: 'cpu' },
];

type Theme = 'light' | 'dark' | 'system';
const readTheme = (): Theme => { try { return (localStorage.getItem('theme') as Theme) || 'system'; } catch { return 'system'; } };

export function RunButton({ className = '' }: { className?: string }) {
  const { active, run, start } = useRun();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const done = run?.stages?.filter(s => s.status === 'done').length ?? 0;
  const onClick = async () => {
    setBusy(true);
    try { await start(true); nav('/analysis'); } finally { setBusy(false); }
  };
  return (
    <button type="button" className={`btn btn-primary ${className}`} onClick={active ? () => nav('/analysis') : onClick} disabled={busy} aria-busy={active || busy}>
      {active ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white spin" aria-hidden />Analizando · {done}/7</> : <><Icon name="play" size={13} />Ejecutar análisis IA</>}
    </button>
  );
}

export function AppShell({ title, crumbs, children, priorityCount }: { title: string; crumbs?: ReactNode; children: ReactNode; priorityCount?: number }) {
  const { providers } = useRun();
  const nav = useNavigate();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);
  const logout = () => { try { sessionStorage.removeItem('token'); } catch { /* ignore */ } nav('/login'); };

  return (
    <div className="min-h-full flex">
      <aside className={`shrink-0 bg-surface border-r border-border flex flex-col ${collapsed ? 'w-14' : 'w-[220px]'} transition-[width]`}>
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
          <span className="w-7 h-7 rounded-md bg-accent-ink text-white grid place-items-center"><Icon name="bolt" size={15} /></span>
          {!collapsed && <span className="font-semibold leading-tight">AI Energy<br /><span className="text-xs text-ink-2 font-normal">Management</span></span>}
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} title={n.label}
              className={({ isActive }) => `flex items-center gap-2.5 h-9 px-2.5 rounded-md no-underline ${isActive ? 'bg-surface-2 text-ink font-semibold' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
              <Icon name={n.icon} size={16} />
              {!collapsed && <span className="flex-1">{n.label}</span>}
              {!collapsed && n.to === '/anomalies' && !!priorityCount && <span className="text-[11px] font-semibold bg-critical text-white rounded-full px-1.5 min-w-5 text-center">{priorityCount}</span>}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="mt-auto m-2 h-8 rounded-md text-ink-3 hover:bg-surface-2 grid place-items-center" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
        </button>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 flex items-center gap-3 px-6 border-b border-border bg-surface sticky top-0 z-10">
          <div className="min-w-0">
            {crumbs && <div className="text-xs text-ink-2 leading-4">{crumbs}</div>}
            <h1 className="text-lg font-semibold leading-6 truncate">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {providers && <><ProviderBadge kind="decision" provider={providers.decision} /><ProviderBadge kind="explanation" provider={providers.explanation} /></>}
            <RunButton />
            <div className="relative group">
              <button type="button" className="w-8 h-8 rounded-full bg-surface-2 text-ink-2 grid place-items-center text-xs font-semibold" aria-haspopup="menu" title="Operador demo">OD</button>
              <div className="absolute right-0 top-9 hidden group-hover:block group-focus-within:block card p-1.5 w-44 text-xs z-20">
                <div className="px-2 py-1 text-ink-2">Operador demo</div>
                <div className="seg w-full my-1">
                  {(['light', 'system', 'dark'] as Theme[]).map(t => <label key={t} className="flex-1 justify-center"><input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />{t === 'light' ? <Icon name="sun" size={12} /> : t === 'dark' ? <Icon name="moon" size={12} /> : 'auto'}</label>)}
                </div>
                <button type="button" className="w-full flex items-center gap-2 px-2 h-8 rounded hover:bg-surface-2" onClick={logout}><Icon name="logout" size={13} />Salir</button>
              </div>
            </div>
          </div>
        </header>
        <main className="p-6 max-w-[1440px] w-full mx-auto flex flex-col gap-4">{children}</main>
      </div>
    </div>
  );
}
