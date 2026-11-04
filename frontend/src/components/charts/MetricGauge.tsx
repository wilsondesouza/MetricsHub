import clsx from 'clsx';

import { formatDecimal } from '../../lib/format';
import type { MetricSeriesConfig } from '../../lib/types';

type Status = 'ok' | 'warn' | 'crit';

const STATUS_COLOR: Record<Status, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  crit: 'var(--danger)',
};

const STATUS_LABEL: Record<Status, string> = {
  ok: 'Normal',
  warn: 'Atenção',
  crit: 'Crítico',
};

function statusOf(value: number | null, series: MetricSeriesConfig): Status {
  if (value === null) return 'ok';
  if (series.crit_at !== null && value >= series.crit_at) return 'crit';
  if (series.warn_at !== null && value >= series.warn_at) return 'warn';
  return 'ok';
}

/**
 * Gauge em SVG puro (sem canvas): acessível, nítido em qualquer DPI e
 * com uma fração do custo de um gráfico completo.
 */
export function MetricGauge({
  series,
  value,
  compact = false,
}: {
  series: MetricSeriesConfig;
  value: number | null;
  compact?: boolean;
}) {
  const max = series.max ?? Math.max((value ?? 0) * 1.25, 1);
  const ratio = value === null ? 0 : Math.min(1, Math.max(0, value / max));
  const status = statusOf(value, series);
  const radius = 42;
  const circumference = Math.PI * radius; // semicírculo
  const dash = circumference * ratio;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl border bg-surface-raised p-3',
        compact ? 'min-w-[150px]' : '',
      )}
    >
      <svg
        viewBox="0 0 100 58"
        className={clsx('shrink-0', compact ? 'h-12 w-[84px]' : 'h-16 w-[110px]')}
        role="img"
        aria-label={`${series.label}: ${value === null ? 'sem dados' : formatDecimal(value, series.unit)}, estado ${STATUS_LABEL[status]}`}
      >
        <path
          d={`M 8 50 A ${radius} ${radius} 0 0 1 92 50`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={`M 8 50 A ${radius} ${radius} 0 0 1 92 50`}
          fill="none"
          stroke={STATUS_COLOR[status]}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)' }}
        />
        <text
          x="50"
          y="47"
          textAnchor="middle"
          className="fill-[var(--text)] font-mono"
          style={{ fontSize: 19, fontWeight: 600 }}
        >
          {value === null ? '—' : Math.round(value)}
        </text>
        <text x="50" y="57" textAnchor="middle" style={{ fontSize: 8, fill: 'var(--text-muted)' }}>
          {series.unit}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink">{series.label}</p>
        <p className="mt-0.5 font-mono text-sm tabular-nums text-ink">
          {value === null ? 'sem dados' : formatDecimal(value, series.unit)}
        </p>
        <span
          className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium"
          style={{ color: STATUS_COLOR[status] }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: STATUS_COLOR[status] }}
            aria-hidden
          />
          {STATUS_LABEL[status]}
          {series.warn_at !== null && (
            <span className="truncate text-muted">
              · alerta {formatDecimal(series.warn_at, series.unit)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
