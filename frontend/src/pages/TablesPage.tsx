import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Eye,
  Search,
  Table2,
  X,
} from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';
import { formatCompact, formatNumber } from '../lib/format';
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui/Primitives';

export function TablesPage() {
  const { dbId = '' } = useParams();
  const [term, setTerm] = useState('');
  const [onlyViews, setOnlyViews] = useState(false);

  const tables = useQuery({
    queryKey: ['tables', dbId],
    queryFn: ({ signal }) => api.listTables(dbId, signal),
  });
  const overview = useQuery({
    queryKey: ['overview', dbId],
    queryFn: ({ signal }) => api.overview(dbId, signal),
  });

  const stats = useMemo(
    () => new Map((overview.data?.tables ?? []).map((table) => [table.name, table])),
    [overview.data],
  );

  const filtered = useMemo(() => {
    const normalized = term.trim().toLowerCase();
    return (tables.data ?? []).filter((table) => {
      if (onlyViews && table.type !== 'view') return false;
      return !normalized || table.name.toLowerCase().includes(normalized);
    });
  }, [tables.data, term, onlyViews]);

  const views = (tables.data ?? []).filter((t) => t.type === 'view').length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <nav aria-label="Trilha" className="flex items-center gap-1 text-[11px] text-muted">
          <Link to="/" className="hover:text-ink">Bancos</Link>
          <span aria-hidden>/</span>
          <Link to={`/db/${dbId}`} className="hover:text-ink">{dbId}</Link>
          <span aria-hidden>/</span>
          <span className="text-subtle">tabelas</span>
        </nav>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Tabelas</h1>
          {tables.data && (
            <p className="text-xs text-muted">
              {tables.data.length} objetos · {tables.data.length - views} tabelas · {views} views
            </p>
          )}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Filtrar tabelas…"
            aria-label="Filtrar tabelas"
            className="input text-xs"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label="Limpar filtro"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-subtle">
          <input
            type="checkbox"
            checked={onlyViews}
            onChange={(event) => setOnlyViews(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          somente views
        </label>
      </div>

      {tables.isError && (
        <div className="card">
          <ErrorState message={(tables.error as Error).message} onRetry={() => tables.refetch()} />
        </div>
      )}

      {tables.isLoading && (
        <ul className="card divide-y">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="flex items-center gap-3 p-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="ml-auto h-3 w-16" />
            </li>
          ))}
        </ul>
      )}

      {tables.data && filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<Table2 />}
            title="Nenhuma tabela encontrada"
            description={term ? `Nada corresponde a “${term}”.` : 'Este banco não possui tabelas.'}
          />
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="card divide-y">
          {filtered.map((table) => {
            const meta = stats.get(table.name);
            return (
              <li key={table.name}>
                <Link
                  to={`/db/${dbId}/tables/${encodeURIComponent(table.name)}`}
                  className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover"
                >
                  <span
                    className={clsx(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                      table.type === 'view'
                        ? 'bg-info/10 text-info'
                        : 'bg-accent-soft text-accent',
                    )}
                  >
                    {table.type === 'view' ? <Eye className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm text-ink">{table.name}</span>
                    <span className="text-[11px] text-muted">
                      {table.type === 'view' ? 'view' : 'tabela'}
                      {meta ? ` · ${meta.columns} colunas` : ''}
                    </span>
                  </span>
                  {meta && (
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-xs text-ink">
                        {formatNumber(meta.rows)}
                      </span>
                      <span className="text-[10px] text-muted">registros</span>
                    </span>
                  )}
                  <Badge tone={table.type === 'view' ? 'info' : 'neutral'} className="hidden sm:inline-flex">
                    {meta ? formatCompact(meta.rows) : '—'}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
