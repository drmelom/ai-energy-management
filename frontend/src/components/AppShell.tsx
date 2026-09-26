import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Cpu, LayoutDashboard, List, LogOut, Moon, Monitor, Play, Siren, Sun, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar';
import { useRun } from '../state/run';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/meters', label: 'Medidores', icon: List },
  { to: '/anomalies', label: 'Anomalías IA', icon: Siren },
  { to: '/analysis', label: 'Análisis IA', icon: Cpu },
];

type Theme = 'light' | 'dark' | 'system';
const readTheme = (): Theme => { try { return (localStorage.getItem('theme') as Theme) || 'system'; } catch { return 'system'; } };
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function RunButton({ size = 'default' }: { size?: 'default' | 'sm' }) {
  const { active, run, start } = useRun();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const done = run?.stages?.filter(s => s.status === 'done').length ?? 0;
  const onClick = async () => { setBusy(true); try { await start(true); nav('/analysis'); } finally { setBusy(false); } };
  return (
    <Button size={size} onClick={active ? () => nav('/analysis') : onClick} disabled={busy} aria-busy={active || busy}>
      {active ? <><span className="size-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />Analizando · {done}/7</> : <><Play />Ejecutar análisis IA</>}
    </Button>
  );
}

export function AppShell({ title, crumbs, children, priorityCount }: { title: string; crumbs?: { label: string; to?: string }[]; children: ReactNode; priorityCount?: number }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => theme === 'system' && applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
  const logout = () => { try { sessionStorage.removeItem('token'); } catch { /* ignore */ } nav('/login'); };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link to="/" />}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="size-4" /></span>
                <span className="grid flex-1 text-left leading-tight"><span className="truncate font-semibold">AI Energy</span><span className="truncate text-xs text-muted-foreground">Management Platform</span></span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operación</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map(n => (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton isActive={n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)} tooltip={n.label} render={<Link to={n.to} />}>
                      <n.icon /><span>{n.label}</span>
                    </SidebarMenuButton>
                    {n.to === '/anomalies' && !!priorityCount && <SidebarMenuBadge className="bg-critical text-white rounded-full">{priorityCount}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="px-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">MVP · datos 01–14/09/2026</p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 backdrop-blur px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 !h-5" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs?.map(c => (
                <span key={c.label} className="contents">
                  <BreadcrumbItem className="hidden md:block">{c.to ? <BreadcrumbLink render={<Link to={c.to} />}>{c.label}</BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}</BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </span>
              ))}
              <BreadcrumbItem><BreadcrumbPage className="serif text-base font-medium">{title}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <RunButton />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="rounded-full text-xs font-semibold" aria-label="Operador demo" />}>OD</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup><DropdownMenuLabel>Operador demo</DropdownMenuLabel></DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={theme} onValueChange={v => setTheme(v as Theme)}>
                  <DropdownMenuRadioItem value="light"><Sun className="mr-2 size-4" />Claro</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark"><Moon className="mr-2 size-4" />Oscuro</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system"><Monitor className="mr-2 size-4" />Sistema</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}><LogOut className="mr-2 size-4" />Salir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex flex-col gap-4 p-4 md:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
