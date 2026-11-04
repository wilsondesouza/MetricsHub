import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Database,
  FileWarning,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Table2,
} from 'lucide-react';

import { api } from '../lib/api';
import { formatBytes, formatCompact, formatNumber } from '../lib/format';
import type { DatabaseInfo } from '../lib/types';
import { Badge, ErrorState, Skeleton } from '../components/ui/Primitives';

export function HomePage() {
  const databases = useQuery({
    queryKey: ['databases'],
    queryFn: ({ signal }) => api.listDatabases(signal),
  });
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal) });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Catálogo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Bancos de dados</h1>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Selecione um banco SQLite para explorar o schema, visualizar registros com filtros e
            acompanhar métricas. Todas as conexões são abertas em modo somente-leitura.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => databases.refetch()}
          disabled={databases.isFetching}
        >
          <RefreshCw className={databases.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Atualizar
        </button>
      </header>

      {databases.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="card space-y-3 p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {databases.isError && (
        <div className="card">
          <ErrorState
            message={(databases.error as Error).message}
            onRetry={() => databases.refetch()}
            hint="Verifique se o backend Flask está em execução e se o proxy /api do Vite está configurado."
          />
        </div>
      )}

      {databases.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {databases.data.map((db) => (
            <DatabaseCard key={db.id} database={db} />
          ))}
          {databases.data.length === 0 && (
            <div className="card col-span-full p-8 text-center text-sm text-subtle">
              Nenhum banco configurado. Adicione entradas em <code className="font-mono">config/config.toml</code>.
            </div>
          )}
        </div>
      )}

      <section aria-label="Estado do servidor" className="mt-8 grid gap-3 sm:grid-cols-3">
        <InfoTile
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Modo de autenticação"
          value={health.data?.auth_mode ?? '—'}
          hint={
            health.data?.auth_mode === 'none'
              ? 'Sem autenticação — não use em rede compartilhada'
              : health.data?.auth_mode === 'loopback'
                ? 'Acesso restrito ao próprio host'
                : 'Token de API exigido'
          }
          tone={health.data?.auth_mode === 'none' ? 'warn' : 'ok'}
        />
        <InfoTile
          icon={<Database className="h-4 w-4" />}
          label="Bancos disponíveis"
          value={
            health.data ? `${health.data.databases.available} / ${health.data.databases.total}` : '—'
          }
          hint={`Uptime ${Math.round((health.data?.uptime_seconds ?? 0) / 60)} min · v${health.data?.version ?? '—'}`}
          tone="accent"
        />
        <InfoTile
          icon={<HardDrive className="h-4 w-4" />}
          label="Recursos"
          value={health.data ? `${health.data.features.metrics} fonte(s) de métricas` : '—'}
          hint={
            health.data
              ? `Editor SQL ${health.data.features.raw_sql ? 'ativo' : 'desativado'} · downloads ${
                  health.data.features.downloads ? 'ativos' : 'desativados'
                }`
              : '—'
          }
          tone="neutral"
        />
      </section>
    </div>
  );
}

function DatabaseCard({ database }: { database: DatabaseInfo }) {
  const overview = useQuery({
    queryKey: ['overview', database.id],
    queryFn: ({ signal }) => api.overview(database.id, signal),
    enabled: database.exists,
  });

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <Database className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{database.name}</h2>
            <p className="truncate font-mono text-[10px] text-muted">{database.id}</p>
          </div>
        </div>
        {database.exists ? (
          <Badge tone="ok">disponível</Badge>
        ) : (
          <Badge tone="danger">
            <FileWarning className="h-3 w-3" /> ausente
          </Badge>
        )}
      </div>

      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs text-subtle">
        {database.description || 'Sem descrição.'}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        <Stat label="Tabelas" value={overview.data ? formatNumber(overview.data.table_count) : '—'} loading={overview.isLoading} />
        <Stat label="Registros" value={overview.data ? formatCompact(overview.data.row_total) : '—'} loading={overview.isLoading} />
        <Stat label="Tamanho" value={formatBytes(database.size_bytes)} loading={false} />
      </div>

      {!database.exists && (
        <p className="mt-2 text-[11px] text-danger">
          Arquivo não encontrado. Rode <code className="font-mono">make seed</code> ou ajuste o caminho no config.
        </p>
      )}
    </>
  );

  if (!database.exists) {
    return <div className="card cursor-not-allowed p-4 opacity-80">{content}</div>;
  }

  return (
    <Link
      to={`/db/${database.id}`}
      className="card group flex flex-col p-4 transition-colors hover:border-accent/60 focus-visible:border-accent"
      aria-label={`Abrir banco ${database.name}`}
    >
      {content}
      <span className="mt-3 inline-flex items-center gap-1 self-end text-[11px] font-medium text-accent">
        Explorar
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Stat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-4 w-12" />
      ) : (
        <p className="mt-0.5 flex items-center gap-1 font-mono text-sm text-ink">
          {label === 'Tabelas' && <Table2 className="h-3 w-3 text-muted" />}
          {value}
        </p>
      )}
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'ok' | 'warn' | 'accent' | 'neutral';
}) {
  const toneClass = {
    ok: 'text-ok',
    warn: 'text-warn',
    accent: 'text-accent',
    neutral: 'text-subtle',
  }[tone];
  return (
    <div className="card flex items-start gap-3 p-3">
      <span className={`mt-0.5 ${toneClass}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-ink">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
      </div>
    </div>
  );
}
