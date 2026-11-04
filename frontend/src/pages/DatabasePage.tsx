import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  Database,
  Eye,
  HardDrive,
  Layers,
  RefreshCw,
  Table2,
} from 'lucide-react';

import { api } from '../lib/api';
import { formatBytes, formatCompact, formatNumber, percentOf } from '../lib/format';
import { useChartTheme, formatAxis, tooltipProps, seriesColor } from '../components/charts/chartTheme';
import { Badge, EmptyState, ErrorState, Section, Skeleton } from '../components/ui/Primitives';

export function DatabasePage() {
  const { dbId = '' } = useParams();
  const theme = useChartTheme();
  const overview = useQuery({
    queryKey: ['overview', dbId],
    queryFn: ({ signal }) => api.overview(dbId, signal),
  });
  const metrics = useQuery({
    queryKey: ['metric-sources'],
    queryFn: ({ signal }) => api.metricSources(signal),
    staleTime: 300_000,
  });

  const data = overview.data;
  const topTables = [...(data?.tables ?? [])].sort((a, b) => b.rows - a.rows).slice(0, 8);
  const maxRows = Math.max(1, ...topTables.map((t) => t.rows));
  const metricSources = (metrics.data ?? []).filter((source) => source.database === dbId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="Trilha" className="flex items-center gap-1 text-[11px] text-muted">
            <Link to="/" className="hover:text-ink">Bancos</Link>
            <span aria-hidden>/</span>
            <span className="text-subtle">{data?.name ?? dbId}</span>
          </nav>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Database className="h-5 w-5 text-accent" />
            {data?.name ?? <Skeleton className="h-6 w-40" />}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCw className={overview.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Atualizar
          </button>
          <Link to={`/db/${dbId}/tables`} className="btn btn-primary">
            <Table2 className="h-4 w-4" />
            Explorar tabelas
          </Link>
        </div>
      </header>

      {overview.isError && (
        <div className="card">
          <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
        </div>
      )}

      {overview.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores do banco">
            <Kpi icon={<Table2 className="h-4 w-4" />} label="Tabelas e views" value={formatNumber(data.table_count)} tone="accent" />
            <Kpi icon={<Layers className="h-4 w-4" />} label="Registros totais" value={formatNumber(data.row_total)} />
            <Kpi
              icon={<HardDrive className="h-4 w-4" />}
              label="Arquivo"
              value={formatBytes(data.size_bytes)}
              hint={`${(data.size_bytes / Math.max(1, data.row_total)).toFixed(0)} bytes/registro`}
            />
            <Kpi
              icon={<Activity className="h-4 w-4" />}
              label="Fontes de métricas"
              value={String(metricSources.length)}
              hint={metricSources.map((m) => m.title).join(', ') || 'nenhuma configurada'}
            />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Section
              title="Tabelas por volume"
              description="As 8 maiores por número de registros"
              className="lg:col-span-3"
              actions={<Badge>{formatNumber(data.table_count)} objetos</Badge>}
            >
              <div className="p-3">
                {topTables.length === 0 ? (
                  <EmptyState title="Banco vazio" description="Nenhuma tabela encontrada neste arquivo." />
                ) : (
                  <div style={{ height: Math.max(200, topTables.length * 36) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topTables} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid horizontal={false} stroke={theme.grid} />
                        <XAxis
                          type="number"
                          tickFormatter={formatAxis}
                          tick={{ fill: theme.text, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          domain={[0, maxRows]}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={130}
                          tick={{ fill: theme.textStrong, fontSize: 11, fontFamily: 'monospace' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          {...tooltipProps}
                          cursor={{ fill: 'var(--accent-soft)' }}
                          formatter={(value: number) => [formatNumber(value), 'registros']}
                        />
                        <Bar dataKey="rows" radius={[0, 4, 4, 0]} barSize={16}>
                          {topTables.map((entry, index) => (
                            <Cell key={entry.name} fill={seriesColor(index)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </Section>

            <Section
              title="Inventário"
              description="Objetos por tipo e distribuição"
              className="lg:col-span-2"
              aria-label="Inventário de objetos"
            >
              <ul className="divide-y">
                {data.tables.map((table) => (
                  <li key={table.name}>
                    <Link
                      to={`/db/${dbId}/tables/${encodeURIComponent(table.name)}`}
                      className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-hover"
                    >
                      {table.type === 'view' ? (
                        <Eye className="h-3.5 w-3.5 shrink-0 text-info" />
                      ) : (
                        <Table2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-ink">{table.name}</span>
                      <span className="w-16 shrink-0 text-right font-mono text-subtle">
                        {formatCompact(table.rows)}
                      </span>
                      <span className="hidden w-8 shrink-0 text-right text-muted sm:inline">
                        {table.columns}c
                      </span>
                      <span
                        className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-surface-hover"
                        title={`${percentOf(table.rows, data.row_total).toFixed(1)}% dos registros`}
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${percentOf(table.rows, data.row_total)}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          {metricSources.length > 0 && (
            <Section
              title="Fontes de métricas"
              description="Séries temporais configuradas para este banco"
              className="mt-4"
            >
              <ul className="divide-y">
                {metricSources.map((source) => (
                  <li key={source.id}>
                    <Link
                      to={`/db/${dbId}/metrics?source=${source.id}`}
                      className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-xs hover:bg-surface-hover"
                    >
                      <Activity className="h-3.5 w-3.5 text-accent" />
                      <span className="font-medium text-ink">{source.title}</span>
                      <span className="font-mono text-muted">{source.table}</span>
                      <div className="ml-auto flex items-center gap-1">
                        {source.series.map((series) => (
                          <Badge key={series.key} tone="accent">
                            {series.label}
                            {series.unit && ` (${series.unit})`}
                          </Badge>
                        ))}
                        <ArrowRight className="ml-1 h-3 w-3 text-muted" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
        <span className={tone === 'accent' ? 'text-accent' : 'text-subtle'}>{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
