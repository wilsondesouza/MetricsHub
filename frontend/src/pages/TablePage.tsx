import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Database,
  Download,
  Eye,
  RefreshCw,
  Sheet,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';

import { api, downloadExport } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useHashState } from '../hooks/useHashState';
import { DataGrid } from '../components/data/DataGrid';
import { FilterBar, type ActiveFilter } from '../components/data/FilterBar';
import { RowDetailDrawer } from '../components/data/RowDetailDrawer';
import { SchemaPanel } from '../components/data/SchemaPanel';
import { ProfilePanel } from '../components/data/ProfilePanel';
import { TableChartPanel } from '../components/charts/TableChartPanel';
import { Badge, ErrorState, Skeleton } from '../components/ui/Primitives';
import { useToast } from '../components/ui/Toast';

const TABS = [
  { id: 'records', label: 'Registros', icon: Table2 },
  { id: 'profile', label: 'Perfil', icon: SlidersHorizontal },
  { id: 'chart', label: 'Gráficos', icon: Eye },
  { id: 'schema', label: 'Schema', icon: Database },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function TablePage() {
  const { dbId = '', table = '' } = useParams();
  const toast = useToast();
  const [tab, setTab] = useState<TabId>('records');
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);

  const [urlState, setUrlState] = useHashState(
    { page: '1', pageSize: '50', sort: '', order: 'asc', search: '', filters: '' },
    `t.${table}`,
  );

  const [searchInput, setSearchInput] = useState(urlState.search);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const filters: ActiveFilter[] = useMemo(() => {
    if (!urlState.filters) return [];
    try {
      const parsed = JSON.parse(urlState.filters) as ActiveFilter[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [urlState.filters]);

  const schema = useQuery({
    queryKey: ['schema', dbId, table],
    queryFn: ({ signal }) => api.tableSchema(dbId, table, signal),
  });

  const page = Math.max(1, Number(urlState.page) || 1);
  const pageSize = Number(urlState.pageSize) || 50;

  const rows = useQuery({
    queryKey: ['rows', dbId, table, page, pageSize, urlState.sort, urlState.order, debouncedSearch, urlState.filters],
    queryFn: ({ signal }) =>
      api.rows(
        dbId,
        table,
        {
          page,
          pageSize,
          sort: urlState.sort || null,
          order: urlState.order === 'desc' ? 'desc' : 'asc',
          search: debouncedSearch,
          filters,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
    enabled: tab === 'records',
  });

  const handleSort = useCallback(
    (column: string) => {
      const isSame = urlState.sort === column;
      setUrlState({
        sort: column,
        order: isSame && urlState.order === 'asc' ? 'desc' : 'asc',
        page: '1',
      });
    },
    [urlState.sort, urlState.order, setUrlState],
  );

  const setFilters = useCallback(
    (next: ActiveFilter[]) => {
      setUrlState({ filters: next.length ? JSON.stringify(next) : '', page: '1' });
    },
    [setUrlState],
  );

  const currentSort = {
    column: urlState.sort || null,
    direction: (urlState.order === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
  };

  const isView = schema.data?.type === 'view';

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col px-4 py-4 sm:px-6">
      <header className="mb-3">
        <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
          <Link to="/" className="hover:text-ink">Bancos</Link>
          <span aria-hidden>/</span>
          <Link to={`/db/${dbId}`} className="hover:text-ink">{dbId}</Link>
          <span aria-hidden>/</span>
          <Link to={`/db/${dbId}/tables`} className="hover:text-ink">tabelas</Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-subtle">{table}</span>
        </nav>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="flex min-w-0 items-center gap-2 font-mono text-xl font-semibold tracking-tight">
            <Table2 className="h-4.5 w-4.5 shrink-0 text-accent" />
            <span className="truncate">{table}</span>
          </h1>
          {rows.data && <Badge tone="accent">{formatNumber(rows.data.pagination.total)} registros</Badge>}
          {isView && <Badge tone="info">view</Badge>}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void rows.refetch();
                toast.info('Dados atualizados');
              }}
              disabled={rows.isFetching}
              title="Recarregar dados"
            >
              <RefreshCw className={rows.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <div className="relative">
              <details className="group">
                <summary className="btn btn-ghost btn-sm cursor-pointer list-none">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exportar</span>
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border bg-surface-raised p-1 shadow-pop">
                  {(['csv', 'json'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-hover"
                      onClick={() => {
                        downloadExport(api.exportUrl(dbId, table, format), `${table}.${format}`);
                        toast.info(`Exportação ${format.toUpperCase()} iniciada`, 'O download respeita o limite configurado no servidor.');
                      }}
                    >
                      <Sheet className="h-3.5 w-3.5" />
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Visões da tabela" className="mb-3 flex gap-1 overflow-x-auto border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            id={`table-tab-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === item.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div
        id={`table-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`table-tab-${tab}`}
        className="min-h-[300px]"
      >
        {tab === 'records' && (
          <div className="space-y-2">
            <FilterBar
              columns={schema.data?.columns ?? []}
              search={searchInput}
              onSearchChange={(value) => {
                setSearchInput(value);
              }}
              filters={filters}
              onFiltersChange={setFilters}
            />
            <DataGrid
              data={rows.data}
              loading={rows.isFetching}
              error={rows.error as Error | null}
              onRetry={() => rows.refetch()}
              sort={currentSort}
              onSortChange={handleSort}
              onPageChange={(next) => setUrlState({ page: String(next) })}
              onPageSizeChange={(size) => setUrlState({ pageSize: String(size), page: '1' })}
              onRowOpen={(row) => setSelectedRow(row)}
              pageSize={pageSize}
            />
          </div>
        )}

        {tab === 'profile' && <ProfilePanel dbId={dbId} table={table} />}
        {tab === 'chart' && <TableChartPanel dbId={dbId} table={table} schema={schema.data} />}
        {tab === 'schema' && (
          <div className="card">
            {schema.isLoading && (
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            )}
            {schema.isError && <ErrorState message={(schema.error as Error).message} />}
            {schema.data && (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-[11px] text-muted">
                  <span>{schema.data.columns.length} colunas</span>
                  <span>{schema.data.indexes.length} índices</span>
                  <span>{schema.data.foreign_keys.length} chaves estrangeiras</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-warn" />
                    identificadores são sempre citados e validados
                  </span>
                </div>
                <SchemaPanel schema={schema.data} />
              </>
            )}
          </div>
        )}
      </div>

      <RowDetailDrawer
        row={selectedRow}
        columns={schema.data?.columns ?? []}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}
