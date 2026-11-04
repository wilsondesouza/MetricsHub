import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Minus,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../lib/api';
import { formatDecimal, formatNumber, formatRelative } from '../lib/format';
import type { MetricHistory, MetricSeriesConfig } from '../lib/types';
import { useHashState } from '../hooks/useHashState';
import { MetricGauge } from '../components/charts/MetricGauge';
import { seriesColor, tooltipProps, useChartTheme } from '../components/charts/chartTheme';
import { Badge, EmptyState, ErrorState, Section, Skeleton } from '../components/ui/Primitives';

const BUCKETS = [
  { value: 'auto', label: 'Automático' },
  { value: 'hour', label: 'Por hora' },
  { value: 'day', label: 'Por dia' },
] as const;

export function MetricsPage() {
  const { dbId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useChartTheme();

  const sources = useQuery({
    queryKey: ['metric-sources'],
    queryFn: ({ signal }) => api.metricSources(signal),
    staleTime: 300_000,
  });

  const available = useMemo(
    () => (sources.data ?? []).filter((source) => source.database === dbId),
    [sources.data, dbId],
  );
  const activeSourceId = searchParams.get('source') ?? available[0]?.id ?? '';
  const activeSource = available.find((source) => source.id === activeSourceId);

  const [live, setLive] = useState(true);
  const [state, setState] = useHashState({ bucket: 'auto', limit: '96' }, `m.${activeSourceId}`);

  useEffect(() => {
    if (!searchParams.get('source') && available[0]) {
      setSearchParams({ source: available[0].id }, { replace: true });
    }
  }, [available, searchParams, setSearchParams]);

  const current = useQuery({
    queryKey: ['metrics-current', activeSourceId],
    queryFn: ({ signal }) => api.currentMetrics(activeSourceId, signal),
    enabled: Boolean(activeSourceId),
    refetchInterval: live ? 15_000 : false,
  });

  const history = useQuery({
    queryKey: ['metrics-history', activeSourceId, state.bucket, state.limit],
    queryFn: ({ signal }) =>
      api.metricHistory(activeSourceId, {
        bucket: state.bucket as 'auto' | 'day' | 'hour',
        limit: Number(state.limit) || 96,
      }, signal),
    enabled: Boolean(activeSourceId),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 60_000 : false,
  });

  if (sources.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!available.length) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="card">
          <EmptyState
            icon={<Activity />}
            title="Nenhuma fonte de métricas"
            description="Declare [[metrics.sources]] em config/config.toml apontando para uma tabela de séries temporais deste banco."
            action={
              <Link to={`/db/${dbId}`} className="btn btn-ghost btn-sm">
                Voltar à visão geral
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav aria-label="Trilha" className="flex items-center gap-1 text-[11px] text-muted">
            <Link to={`/db/${dbId}`} className="hover:text-ink">{dbId}</Link>
            <span aria-hidden>/</span>
            <span>métricas</span>
          </nav>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-accent" />
            {activeSource?.title ?? 'Métricas'}
          </h1>
          {activeSource && (
            <p className="mt-0.5 text-xs text-muted">
              tabela <code className="font-mono">{activeSource.table}</code> · última leitura{' '}
              {current.data ? formatRelative(current.data.timestamp) : '—'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 1 && (
            <select
              value={activeSourceId}
              onChange={(event) => setSearchParams({ source: event.target.value })}
              aria-label="Fonte de métricas"
              className="rounded-lg border bg-surface-sunken px-2 py-1.5 text-xs text-ink"
            >
              {available.map((source) => (
                <option key={source.id} value={source.id}>{source.title}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setLive((value) => !value)}
            aria-pressed={live}
            title={live ? 'Pausar atualização automática' : 'Retomar atualização automática'}
          >
            {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {live ? 'Ao vivo (15s)' : 'Pausado'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              void current.refetch();
              void history.refetch();
            }}
            disabled={current.isFetching}
          >
            <RefreshCw className={current.isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Atualizar
          </button>
        </div>
      </header>

      {current.isError && (
        <div className="card mb-3">
          <ErrorState
            title="Sem leitura atual"
            message={(current.error as Error).message}
            onRetry={() => current.refetch()}
          />
        </div>
      )}

      {/* Gauges */}
      <section aria-label="Valores atuais" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(current.data?.series ?? activeSource?.series ?? []).map((series) => (
          <MetricGauge
            key={series.key}
            series={series}
            value={current.data?.values[series.key] ?? null}
          />
        ))}
      </section>

      {/* Controles do histórico */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Histórico</h2>
          <p className="text-[11px] text-muted">
            Agregação {state.bucket === 'auto' ? 'automática' : state.bucket === 'hour' ? 'por hora' : 'diária'} ·
            o servidor calcula as médias em SQL
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border p-0.5">
            {BUCKETS.map((bucket) => (
              <button
                key={bucket.value}
                type="button"
                onClick={() => setState({ bucket: bucket.value })}
                aria-pressed={state.bucket === bucket.value}
                className={`rounded px-2 py-1 text-[11px] ${
                  state.bucket === bucket.value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                {bucket.label}
              </button>
            ))}
          </div>
          <select
            value={state.limit}
            onChange={(event) => setState({ limit: event.target.value })}
            aria-label="Quantidade de pontos"
            className="rounded-lg border bg-surface-sunken px-2 py-1.5 text-[11px] text-ink"
          >
            {[24, 48, 96, 168, 336].map((value) => (
              <option key={value} value={value}>{value} pontos</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {history.isLoading && activeSource
          ? activeSource.series.map((series) => <Skeleton key={series.key} className="h-64 w-full" />)
          : null}
        {history.isError && (
          <div className="card lg:col-span-2">
            <ErrorState message={(history.error as Error).message} onRetry={() => history.refetch()} />
          </div>
        )}
        {history.data?.points.length === 0 && (
          <div className="card lg:col-span-2">
            <EmptyState
              icon={<Clock />}
              title="Sem histórico"
              description="A fonte existe, mas não há amostras no período. Os gráficos aparecem quando houver dados."
            />
          </div>
        )}
        {history.data && history.data.points.length > 0 &&
          history.data.series.map((series, index) => (
            <SeriesCard
              key={series.key}
              series={series}
              history={history.data}
              color={seriesColor(index)}
              theme={theme}
            />
          ))}
      </div>
    </div>
  );
}

function SeriesCard({
  series,
  history,
  color,
  theme,
}: {
  series: MetricSeriesConfig;
  history: MetricHistory;
  color: string;
  theme: ReturnType<typeof useChartTheme>;
}) {
  const stats = history.stats[series.key];
  const points = history.points;
  const last = stats?.latest;
  const previous = points.length > 1 ? (points[points.length - 2]?.[series.key] as number | null) : null;
  const delta = last !== undefined && last !== null && previous !== null && previous !== undefined
    ? last - previous
    : null;

  return (
    <Section
      title={series.label}
      description={`${series.column}${series.unit ? ` · ${series.unit}` : ''}`}
      actions={
        <>
          <Badge tone="neutral" title="Mínimo / média / máximo no período">
            {stats?.min !== undefined ? `${formatDecimal(stats.min)} / ${formatDecimal(stats.avg ?? 0)} / ${formatDecimal(stats.max ?? 0)}` : '—'}
          </Badge>
          {delta !== null && (
            <Badge tone={delta > 0 ? 'warn' : delta < 0 ? 'ok' : 'neutral'}>
              {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {formatDecimal(Math.abs(delta))}
            </Badge>
          )}
        </>
      }
    >
      <div className="h-56 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: theme.text, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: theme.grid }}
              minTickGap={28}
            />
            <YAxis
              domain={[0, series.max ?? 'auto']}
              tick={{ fill: theme.text, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(value: number) => formatNumber(Math.round(value))}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(value: number) => [formatDecimal(value, series.unit), series.label]}
            />
            <Line
              type="monotone"
              dataKey={series.key}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <footer className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted">
        <span>{points.length} pontos · {formatNumber(points.reduce((sum, p) => sum + ((p.samples as number) || 0), 0))} amostras</span>
        {series.crit_at !== null && <span>limite crítico: {formatDecimal(series.crit_at, series.unit)}</span>}
      </footer>
    </Section>
  );
}
