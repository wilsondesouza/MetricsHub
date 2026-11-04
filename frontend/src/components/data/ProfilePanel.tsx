import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Gauge, Search } from 'lucide-react';

import { api } from '../../lib/api';
import { formatDecimal, formatNumber, formatPercent } from '../../lib/format';
import type { ColumnProfileBase } from '../../lib/types';
import { Badge, ErrorState, Skeleton } from '../ui/Primitives';
import { seriesColor, tooltipProps } from '../charts/chartTheme';

export function ProfilePanel({ dbId, table }: { dbId: string; table: string }) {
  const [term, setTerm] = useState('');
  const profile = useQuery({
    queryKey: ['profile', dbId, table],
    queryFn: ({ signal }) => api.profile(dbId, table, signal),
    staleTime: 120_000,
  });

  const columns = useMemo(() => {
    const all = profile.data?.columns ?? [];
    const normalized = term.trim().toLowerCase();
    return normalized ? all.filter((column) => column.name.toLowerCase().includes(normalized)) : all;
  }, [profile.data?.columns, term]);

  if (profile.isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card space-y-2 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="card">
        <ErrorState message={(profile.error as Error).message} onRetry={() => profile.refetch()} />
      </div>
    );
  }

  if (!profile.data) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Filtrar colunas…"
            aria-label="Filtrar colunas do perfil"
            className="input pl-8 text-xs"
          />
        </div>
        <Badge tone={profile.data.sampled ? 'warn' : 'ok'}>
          {profile.data.sampled
            ? `amostra de ${formatNumber(profile.data.sampled_rows)} de ${formatNumber(profile.data.row_total)} linhas`
            : `${formatNumber(profile.data.row_total)} linhas analisadas`}
        </Badge>
        {profile.data.datetime_column && (
          <Badge tone="accent">eixo temporal: {profile.data.datetime_column}</Badge>
        )}
        {profile.data.sampled && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <AlertCircle className="h-3 w-3" />
            valores aproximados em bases grandes
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {columns.map((column, index) => (
          <ColumnCard key={column.name} column={column} index={index} />
        ))}
      </div>
    </div>
  );
}

function ColumnCard({ column, index }: { column: ColumnProfileBase; index: number }) {
  const isNumeric = column.kind === 'number';
  const color = seriesColor(index);

  return (
    <article className="card flex flex-col p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-xs font-semibold text-ink">{column.name}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
            {column.type || column.kind}
            {column.primary_key && ' · pk'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={isNumeric ? 'accent' : column.kind === 'blob' ? 'info' : 'neutral'}>
            {isNumeric ? 'numérico' : column.kind}
          </Badge>
          {column.null_ratio > 0 && (
            <span className="text-[10px] text-warn" title="Proporção de valores nulos">
              {formatPercent(column.null_ratio)} nulos
            </span>
          )}
        </div>
      </header>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between">
          <dt className="text-muted">distintos</dt>
          <dd className="font-mono text-ink">{formatNumber(column.distinct_sampled)}</dd>
        </div>
        {isNumeric ? (
          <>
            <div className="flex justify-between">
              <dt className="text-muted">média</dt>
              <dd className="font-mono text-ink">{formatDecimal(column.mean ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">mín</dt>
              <dd className="font-mono text-ink">{formatDecimal(column.min ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">máx</dt>
              <dd className="font-mono text-ink">{formatDecimal(column.max ?? 0)}</dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <dt className="text-muted">tipo</dt>
            <dd className="text-ink">{column.is_datetime ? 'data/hora' : column.kind}</dd>
          </div>
        )}
      </dl>

      {isNumeric && column.histogram && column.histogram.length > 1 && (
        <div className="mt-2 h-24" aria-label={`Histograma de ${column.name}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={column.histogram} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="from" hide />
              <YAxis hide />
              <Tooltip
                {...tooltipProps}
                cursor={{ fill: 'var(--accent-soft)' }}
                formatter={(value: number) => [formatNumber(value), 'linhas']}
                labelFormatter={(label: number) =>
                  `a partir de ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(label)}`
                }
              />
              <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {column.top_values && column.top_values.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted">valores mais frequentes</p>
          {column.top_values.slice(0, 5).map((entry) => {
            const max = column.top_values?.[0]?.count ?? 1;
            return (
              <div key={entry.value} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-subtle" title={entry.value}>
                  {entry.value || '∅'}
                </span>
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(entry.count / max) * 100}%`, background: color }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted">
                  {formatNumber(entry.count)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {column.range && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted">
          <Gauge className="h-3 w-3" />
          {new Date(column.range.min).toLocaleDateString('pt-BR')} →{' '}
          {new Date(column.range.max).toLocaleDateString('pt-BR')}
        </p>
      )}
    </article>
  );
}
