import { useEffect, useRef } from 'react';
import { Braces, Copy, X } from 'lucide-react';

import { describeCell } from '../../lib/format';
import type { ColumnInfo } from '../../lib/types';
import { useToast } from '../ui/Toast';

interface RowDetailDrawerProps {
  row: Record<string, unknown> | null;
  columns: ColumnInfo[];
  onClose: () => void;
}

export function RowDetailDrawer({ row, columns, onClose }: RowDetailDrawerProps) {
  const toast = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (row) closeRef.current?.focus();
  }, [row]);

  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  if (!row) return null;

  const json = JSON.stringify(row, null, 2);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success('Linha copiada como JSON');
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes da linha"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-surface-raised shadow-pop animate-slide-in-right"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Detalhes da linha</h2>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyJson}>
            <Copy className="h-3.5 w-3.5" />
            JSON
          </button>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Fechar detalhes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <dl className="divide-y">
          {columns.map((column) => {
            const value = row[column.name] as never;
            const cell = describeCell(value, column.kind);
            const isBlob = typeof value === 'object' && value !== null && '__type' in value;
            return (
              <div key={column.name} className="grid grid-cols-[minmax(90px,35%)_1fr] gap-3 py-2.5">
                <dt className="min-w-0">
                  <span className="block truncate font-mono text-xs text-ink">{column.name}</span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-muted">
                    {column.type || column.kind}
                    {column.primary_key && ' · pk'}
                    {column.not_null && ' · not null'}
                  </span>
                </dt>
                <dd
                  className={
                    cell.tone === 'number'
                      ? 'break-words text-right font-mono text-xs tabular-nums'
                      : 'break-words font-mono text-xs'
                  }
                >
                  {value === null || value === undefined ? (
                    <span className="italic text-muted">NULL</span>
                  ) : isBlob ? (
                    <details>
                      <summary className="cursor-pointer text-info">
                        BLOB de {(value as { size: number }).size} bytes
                      </summary>
                      <code className="mt-1 block break-all rounded bg-surface-sunken p-2 text-[10px]">
                        {(value as { preview: string }).preview}
                      </code>
                    </details>
                  ) : (
                    String(value)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      <footer className="border-t px-4 py-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Braces className="h-3 w-3" /> {columns.length} campos · Esc para fechar
        </span>
      </footer>
    </div>
  );
}
