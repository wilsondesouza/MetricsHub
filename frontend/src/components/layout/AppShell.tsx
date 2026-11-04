import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity,
  ChevronLeft,
  Database,
  Gauge,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  Search,
  Sun,
  Table2,
  Terminal,
  X,
} from 'lucide-react';

import { api } from '../../lib/api';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Badge, Kbd, Skeleton } from '../ui/Primitives';
import { CommandPalette } from './CommandPalette';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  end?: boolean;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { dbId } = useParams();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { resolved, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('metricshub:sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('metricshub:sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      /* noop */
    }
  }, [collapsed]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Atalhos globais: ⌘K/Ctrl+K abre a paleta; "g d"/"g x" navegação rápida.
  useEffect(() => {
    let lastKey = '';
    let lastAt = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === 'Escape') setPaletteOpen(false);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const now = Date.now();
      if (lastKey === 'g' && now - lastAt < 800) {
        if (event.key === 'd') {
          window.location.assign('/');
        }
        lastKey = '';
        return;
      }
      lastKey = event.key;
      lastAt = now;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const databases = useQuery({ queryKey: ['databases'], queryFn: ({ signal }) => api.listDatabases(signal) });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.health(signal),
    refetchInterval: 60_000,
  });

  const navItems: NavItem[] = dbId
    ? [
        { to: `/db/${dbId}`, label: 'Visão geral', icon: LayoutDashboard, end: true },
        { to: `/db/${dbId}/tables`, label: 'Tabelas', icon: Table2 },
        { to: `/db/${dbId}/metrics`, label: 'Métricas', icon: Activity },
      ]
    : [{ to: '/', label: 'Bancos de dados', icon: Database, end: true }];

  const activeDb = databases.data?.find((db) => db.id === dbId);

  return (
    <div className="flex min-h-dvh bg-surface">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accent-ink"
      >
        Pular para o conteúdo
      </a>

      {/* Backdrop mobile */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        aria-label="Navegação principal"
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-surface-raised transition-[width,transform] duration-200',
          collapsed && !isMobile ? 'w-[68px]' : 'w-64',
          isMobile && (sidebarOpen ? 'translate-x-0' : '-translate-x-full'),
          'md:sticky md:top-0 md:h-dvh md:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-3">
          <NavLink
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-lg p-1 hover:bg-surface-hover"
            aria-label="MetricsHub — início"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Gauge className="h-4.5 w-4.5" strokeWidth={2.2} />
            </span>
            {!collapsed && (
              <span className="truncate text-sm font-semibold tracking-tight">MetricsHub</span>
            )}
          </NavLink>
          {isMobile ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon ml-auto"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-icon ml-auto"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronLeft className="h-4 w-4 rotate-180" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Seletor de banco */}
        <div className="border-b p-3">
          {databases.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <NavLink
              to="/"
              className={clsx(
                'flex items-center gap-2 rounded-lg border bg-surface-sunken px-2.5 py-2 text-sm hover:border-accent/50',
                collapsed && 'justify-center',
              )}
              title={activeDb ? `${activeDb.name} — trocar banco` : 'Escolher banco de dados'}
            >
              <Database className="h-4 w-4 shrink-0 text-accent" />
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate">
                  {activeDb?.name ??
                    `${databases.data?.filter((db) => db.exists).length ?? 0} bancos`}
                </span>
              )}
              {!collapsed && (
                <Badge tone={activeDb ? 'ok' : 'neutral'}>
                  {activeDb ? 'aberto' : 'catálogo'}
                </Badge>
              )}
            </NavLink>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      collapsed && 'justify-center',
                      isActive
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-subtle hover:bg-surface-hover hover:text-ink',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t p-2">
          {health.data?.features.raw_sql && dbId && (
            <NavLink
              to={`/db/${dbId}/sql`}
              title="Editor SQL (somente leitura)"
              className={({ isActive }) =>
                clsx(
                  'mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                  collapsed && 'justify-center',
                  isActive ? 'bg-accent-soft text-accent' : 'text-subtle hover:bg-surface-hover hover:text-ink',
                )
              }
            >
              <Terminal className="h-4 w-4 shrink-0" />
              {!collapsed && 'Editor SQL'}
            </NavLink>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mb-2 flex w-full items-center gap-2 rounded-lg border bg-surface-sunken px-2.5 py-1.5 text-xs text-muted hover:border-accent/50"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Buscar…</span>
              <Kbd>⌘K</Kbd>
            </button>
          )}
          <div className={clsx('flex items-center gap-1', collapsed && 'flex-col')}>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={toggle}
              aria-label={resolved === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {!collapsed && (
              <div className="ml-auto flex items-center gap-1 text-[11px] text-muted">
                <span
                  className={clsx(
                    'h-1.5 w-1.5 rounded-full',
                    health.isError ? 'bg-danger' : 'bg-ok',
                  )}
                />
                v{health.data?.version ?? '—'}
                {health.data?.auth_mode === 'none' && (
                  <Badge tone="warn" title="auth_mode = none">
                    sem auth
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-surface-raised/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">{activeDb?.name ?? 'MetricsHub'}</span>
          <button
            type="button"
            className="btn btn-ghost btn-icon ml-auto"
            onClick={() => setPaletteOpen(true)}
            aria-label="Buscar tabelas"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={toggle}
            aria-label="Alternar tema"
          >
            {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main id="conteudo" className="min-w-0 flex-1 animate-fade-in">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
