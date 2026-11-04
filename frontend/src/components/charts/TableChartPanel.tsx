import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartLine, Info } from 'lucide-react';

import { api } from '../../lib/api';
import { formatDecimal, formatNumber } from '../../lib/format';
import type { TableSchema } from '../../lib/types';
import { Badge, EmptyState, ErrorState, Skeleton } from '../ui/Primitives';
import { formatAxis, seriesColor, tooltipProps, useChartTheme } from './chartTheme';

const AGGREGATIONS = [
  { value: 'avg', label: 'Média' },
  { value: 'sum', label: 'Soma' },
  { value: 'max', label: 'Máximo' },
  { value: 'min', label: 'Mínimo' },
  { value: 'count', label: 'Contagem' },
] as const;

export function TableChartPanel({
  dbId,
  table,
  schema,
}: {
  dbId: string;
  table: string;
  schema: TableSchema | undefined;
}) {
  const theme = useChartTheme();
  const [mode, setMode] = useState<'timeline' | 'distribution'>('timeline');

  const numericColumns = useMemo(
    () => (schema?.columns ?? []).filter((column) => ['integer', 'real', 'number'].includes(column.kind)),
    [schema],
  );
  const allColumns = schema?.columns ?? [];

  const [valueColumn, setValueColumn] = useState('');
  const [timeColumn, setTimeColumn] = useState<string>('');
  const [agg, setAgg] = useState<(typeof AGGREGATIONS)[number]['value']>('avg');
  const [categoryColumn, setCategoryColumn] = useState('');

  useEffect(() => {
    if (valueColumn) return;
    // Evita séries sem significado (ex.: a própria PK); prefere uma métrica.
    const preferred = numericColumns.find((column) => !column.primary_key) ?? numericColumns[0];
    if (preferred) setValueColumn(preferred.name);
  }, [numericColumns, valueColumn]);
  useEffect(() => {
    if (!categoryColumn && allColumns[0]) setCategoryColumn(allColumns[0].name);
  }, [allColumns, categoryColumn]);

  const timeline = useQuery({
    queryKey: ['timeline', dbId, table, valueColumn, timeColumn, agg],
    queryFn: ({ signal }) =>
      api.timeline(dbId, table, {
        valueColumn,
        timeColumn: timeColumn || null,
        agg,
        limit: 120,
      }, signal),
    enabled: mode === 'timeline' && Boolean(valueColumn),
  });

  // Distribuição: reaproveita o perfil (top valores) já cacheado no servidor.
  const profile = useQuery({
    queryKey: ['profile', dbId, table],
    queryFn: ({ signal }) => api.profile(dbId, table, signal),
    enabled: mode === 'distribution',
  });

  const categoryProfile = profile.data?.columns.find((column) => column.name === categoryColumn);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Tipo de gráfico">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'timeline'}
            onClick={() => setMode('timeline')}
            className={`rounded-md px-2.5 py-1 text-xs ${mode === 'timeline' ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}
          >
            Série temporal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'distribution'}
            onClick={() => setMode('distribution')}
            className={`rounded-md px-2.5 py-1 text-xs ${mode === 'distribution' ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}
          >
            Distribuição
          </button>
        </div>

        {mode === 'timeline' ? (
          <>
            <label className="flex items-center gap-1 text-[11px] text-muted">
              valor
              <select
                value={valueColumn}
                onChange={(event) => setValueColumn(event.target.value)}
                className="rounded border bg-surface-sunken px-1.5 py-1 text-xs text-ink"
              >
                {numericColumns.map((column) => (
                  <option key={column.name} value={column.name}>{column.name}</option>
                ))}
                {numericColumns.length === 0 && <option value="">sem colunas numéricas</option>}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted">
              agregação
              <select
                value={agg}
                onChange={(event) => setAgg(event.target.value as typeof agg)}
                className="rounded border bg-surface-sunken px-1.5 py-1 text-xs text-ink"
              >
                {AGGREGATIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted">
              tempo
              <select
                value={timeColumn}
                onChange={(event) => setTimeColumn(event.target.value)}
                className="max-w-[140px] rounded border bg-surface-sunken px-1.5 py-1 text-xs text-ink"
              >
                <option value="">detectar automaticamente</option>
                {allColumns.map((column) => (
                  <option key={column.name} value={column.name}>{column.name}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="flex items-center gap-1 text-[11px] text-muted">
            coluna
            <select
              value={categoryColumn}
              onChange={(event) => setCategoryColumn(event.target.value)}
              className="rounded border bg-surface-sunken px-1.5 py-1 text-xs text-ink"
            >
              {allColumns.map((column) => (
                <option key={column.name} value={column.name}>{column.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="p-3">
        {mode === 'timeline' && (
          <>
            {!valueColumn && (
              <EmptyState
                icon={<ChartLine />}
                title="Sem colunas numéricas"
                description="Esta tabela não possui colunas numéricas para agregar. Use a aba Perfil para explorar distribuições de texto."
              />
            )}
            {timeline.isLoading && valueColumn && <Skeleton className="h-64 w-full" />}
            {timeline.isError && (
              <ErrorState message={(timeline.error as Error).message} onRetry={() => timeline.refetch()} />
            )}
            {timeline.data && timeline.data.points.length === 0 && (
              <EmptyState
                icon={<ChartLine />}
                title="Sem série temporal"
                description="Não foi possível agrupar os dados por data. Selecione manualmente uma coluna de tempo."
              />
            )}
            {timeline.data && timeline.data.points.length > 0 && (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <Badge tone="accent">{agg} de {valueColumn}</Badge>
                  {timeline.data.time_column ? (
                    <span>agrupado por dia em <code className="font-mono">{timeline.data.time_column}</code></span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Info className="h-3 w-3" /> sem coluna temporal — valor agregado único
                    </span>
                  )}
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline.data.points} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="timelineFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={theme.accent} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={theme.grid} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: theme.text, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: theme.grid }}
                        minTickGap={24}
                      />
                      <YAxis
                        tickFormatter={formatAxis}
                        tick={{ fill: theme.text, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                      />
                      <Tooltip
                        {...tooltipProps}
                        formatter={(value: number) => [formatDecimal(value), valueColumn]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={theme.accent}
                        strokeWidth={2}
                        fill="url(#timelineFill)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        )}

        {mode === 'distribution' && (
          <>
            {profile.isLoading && <Skeleton className="h-64 w-full" />}
            {profile.isError && (
              <ErrorState message={(profile.error as Error).message} onRetry={() => profile.refetch()} />
            )}
            {categoryProfile && (
              <>
                <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
                  <Badge tone="accent">{categoryColumn}</Badge>
                  <span>
                    {categoryProfile.kind === 'number'
                      ? 'coluna numérica — veja o histograma na aba Perfil'
                      : `top ${categoryProfile.top_values?.length ?? 0} valores mais frequentes`}
                  </span>
                </div>
                {categoryProfile.top_values && categoryProfile.top_values.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryProfile.top_values} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke={theme.grid} vertical={false} />
                        <XAxis
                          dataKey="value"
                          tick={{ fill: theme.text, fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          height={48}
                          angle={-20}
                          textAnchor="end"
                        />
                        <YAxis
                          tickFormatter={formatAxis}
                          tick={{ fill: theme.text, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={52}
                        />
                        <Tooltip {...tooltipProps} formatter={(value: number) => [formatNumber(value), 'linhas']} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {categoryProfile.top_values.map((entry, index) => (
                            <Cell key={entry.value} fill={seriesColor(index)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    icon={<ChartLine />}
                    title="Coluna sem distribuição categórica"
                    description="Selecione uma coluna de texto para ver os valores mais frequentes."
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
