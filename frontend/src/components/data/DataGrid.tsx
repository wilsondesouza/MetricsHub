import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Binary,
  Braces,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Hash,
  KeyRound,
  Rows3,
  Type,
} from 'lucide-react';

import { describeCell, formatNumber, truncate } from '../../lib/format';
import type { ColumnInfo, PageInfo, RowsResponse } from '../../lib/types';
import { Badge, EmptyState, Skeleton } from '../ui/Primitives';
import { useToast } from '../ui/Toast';

const KIND_ICONS = {
  integer: Hash,
  real: Hash,
  number: Hash,
  text: Type,
  blob: Binary,
  datetime: CalendarDays,
  unknown: Braces,
  other: Braces,
} as const;

type Density = 'comfortable' | 'compact';

interface DataGridProps {
  data: RowsResponse | undefined;
  loading: boolean;
  error?: Error | null;
  onRetry?: () => void;
  sort: { column: string | null; direction: 'asc' | 'desc' };
  onSortChange: (column: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onRowOpen?: (row: Record<string, unknown>) => void;
  pageSize: number;
}

export function DataGrid({
  data,
  loading,
  error,
  onRetry,
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onRowOpen,
  pageSize,
}: DataGridProps) {
  const toast = useToast();
  const [density, setDensity] = useState<Density>('comfortable');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [columnsMenu, setColumnsMenu] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const columns = useMemo(
    () => (data?.columns ?? []).filter((column) => !hidden.has(column.name)),
    [data?.columns, hidden],
  );

  const totals = data?.pagination;
  const rangeStart = totals ? (totals.page - 1) * totals.page_size + 1 : 0;
  const rangeEnd = totals ? Math.min(totals.page * totals.page_size, totals.total) : 0;

  const copyCell = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1200);
    } catch {
      toast.error('Não foi possível copiar', 'O navegador bloqueou o acesso à área de transferência.');
    }
  };

  const toggleColumn = (name: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else if (next.size < (data?.columns.length ?? 1) - 1) next.add(name);
      return next;
    });
  };

  if (error) {
    return (
      <div className="card">
        <div role="alert" className="p-6 text-center">
          <p className="text-sm font-medium text-ink">Falha ao consultar a tabela</p>
          <p className="mt-1 text-xs text-subtle">{error.message}</p>
          {onRetry && (
            <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={onRetry}>
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Rows3 className="h-3.5 w-3.5" aria-hidden />
          {totals ? (
            <span>
              <strong className="font-medium text-ink">
                {formatNumber(rangeStart)}–{formatNumber(rangeEnd)}
              </strong>{' '}
              de {formatNumber(totals.total)}
              {data?.query_ms !== undefined && (
                <span className="ml-2 hidden text-[11px] text-muted sm:inline">
                  {data.query_ms} ms
                </span>
              )}
            </span>
          ) : (
            <Skeleton className="h-3 w-24" />
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setColumnsMenu((open) => !open)}
              aria-expanded={columnsMenu}
              aria-haspopup="true"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Colunas
              <ChevronDown className="h-3 w-3" />
            </button>
            {columnsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setColumnsMenu(false)} aria-hidden />
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-56 overflow-auto rounded-lg border bg-surface-raised p-1 shadow-pop">
                  {(data?.columns ?? []).map((column) => (
                    <label
                      key={column.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-surface-hover"
                    >
                      <input
                        type="checkbox"
                        checked={!hidden.has(column.name)}
                        onChange={() => toggleColumn(column.name)}
                        className="accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate font-mono">{column.name}</span>
                      <span className="text-[10px] text-muted">{column.kind}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
            title="Alternar densidade das linhas"
          >
            {density === 'comfortable' ? 'Compacto' : 'Confortável'}
          </button>

          <label className="ml-1 flex items-center gap-1 text-[11px] text-muted">
            <span className="hidden sm:inline">linhas</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded border bg-surface-sunken px-1 py-0.5 text-[11px] text-ink"
              aria-label="Linhas por página"
            >
              {[25, 50, 100, 200].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Tabela */}
      <div className="max-h-[calc(100dvh-21rem)] min-h-[220px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <caption className="sr-only">
            Dados da tabela {data?.table ?? ''} — página {totals?.page ?? 1} de {totals?.pages ?? 1}
          </caption>
          <thead className="table-sticky">
            <tr>
              <th
                scope="col"
                className="w-10 border-b bg-surface-raised px-2 py-2 text-right font-mono text-[10px] font-normal text-muted"
              >
                #
              </th>
              {columns.map((column) => (
                <th
                  key={column.name}
                  scope="col"
                  aria-sort={
                    sort.column === column.name
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="whitespace-nowrap border-b bg-surface-raised px-2 py-1.5 font-medium text-subtle"
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(column.name)}
                    className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-ink"
                    title={`${column.name} (${column.type || column.kind})`}
                  >
                    <ColumnIcon column={column} />
                    <span className="font-mono text-[11px] text-ink">{column.name}</span>
                    {column.primary_key && (
                      <KeyRound className="h-3 w-3 text-warn" aria-label="chave primária" />
                    )}
                    {sort.column === column.name ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp className="h-3 w-3 text-accent" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-accent" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <SkeletonRows columns={columns.length || 5} />
            )}
            {data?.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                tabIndex={0}
                onClick={() => onRowOpen?.(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onRowOpen?.(row);
                }}
                className="group cursor-pointer outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
              >
                <td className="border-b px-2 text-right font-mono text-[10px] text-muted">
                  {rangeStart + rowIndex}
                </td>
                {columns.map((column) => {
                  const cell = describeCell(
                    row[column.name] as never,
                    column.kind,
                  );
                  const cellKey = `${rowIndex}-${column.name}`;
                  return (
                    <td
                      key={column.name}
                      className={clsx(
                        'group/cell relative max-w-[320px] border-b px-2',
                        density === 'compact' ? 'py-0.5' : 'py-1.5',
                        cell.align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      <span
                        title={cell.title}
                        className={clsx(
                          'inline-block max-w-full truncate align-bottom',
                          density === 'compact' ? 'text-[11px]' : 'text-xs',
                          cell.tone === 'null' && 'italic text-muted',
                          cell.tone === 'number' && 'font-mono tabular-nums text-ink',
                          cell.tone === 'blob' && 'font-mono text-info',
                          cell.tone === 'date' && 'text-subtle',
                          cell.tone === 'boolean' && 'font-mono text-warn',
                          cell.tone === 'text' && 'text-ink',
                        )}
                      >
                        {truncate(cell.display, 90)}
                      </span>
                      {cell.copyValue && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyCell(cell.copyValue, cellKey);
                          }}
                          className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded bg-surface-raised p-1 text-muted shadow-sm hover:text-ink group-hover/cell:block"
                          aria-label={`Copiar valor de ${column.name}`}
                        >
                          {copied === cellKey ? (
                            <Check className="h-3 w-3 text-ok" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!loading && data && data.rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1}>
                  <EmptyState
                    title="Nenhuma linha corresponde aos filtros"
                    description="Ajuste a busca ou remova filtros para ver mais resultados."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <Pagination pagination={totals} onPageChange={onPageChange} loading={loading} />
    </div>
  );
}

function ColumnIcon({ column }: { column: ColumnInfo }) {
  const Icon = KIND_ICONS[column.kind] ?? Braces;
  return <Icon className="h-3 w-3 shrink-0 text-muted" aria-hidden />;
}

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          <td className="border-b px-2 py-2">
            <Skeleton className="ml-auto h-2.5 w-5" />
          </td>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex} className="border-b px-2 py-2">
              <Skeleton className="h-2.5" style={{ width: `${45 + ((rowIndex * 7 + columnIndex * 13) % 45)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Pagination({
  pagination,
  onPageChange,
  loading,
}: {
  pagination: PageInfo | undefined;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  const [jump, setJump] = useState('');
  if (!pagination) return <div className="h-11 border-t" />;
  const { page, pages, has_next, has_prev } = pagination;

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2"
    >
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => onPageChange(1)} disabled={!has_prev || loading} aria-label="Primeira página">
          <ChevronFirst className="h-4 w-4" />
        </button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => onPageChange(page - 1)} disabled={!has_prev || loading} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 text-xs text-subtle">
          Página <strong className="text-ink">{formatNumber(page)}</strong> de {formatNumber(pages)}
        </span>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => onPageChange(page + 1)} disabled={!has_next || loading} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => onPageChange(pages)} disabled={!has_next || loading} aria-label="Última página">
          <ChevronLast className="h-4 w-4" />
        </button>
      </div>
      <form
        className="flex items-center gap-1 text-xs text-muted"
        onSubmit={(event) => {
          event.preventDefault();
          const target = Number(jump);
          if (Number.isFinite(target) && target >= 1 && target <= pages) onPageChange(target);
          setJump('');
        }}
      >
        <label htmlFor="page-jump">Ir para</label>
        <input
          id="page-jump"
          inputMode="numeric"
          value={jump}
          onChange={(event) => setJump(event.target.value.replace(/\D/g, ''))}
          className="w-14 rounded border bg-surface-sunken px-1.5 py-0.5 text-center text-xs text-ink focus:border-accent focus:outline-none"
          placeholder={String(page)}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!jump}>
          Ir
        </button>
        <Badge className="ml-1 hidden sm:inline-flex">{formatNumber(pagination.total)} registros</Badge>
      </form>
    </nav>
  );
}
