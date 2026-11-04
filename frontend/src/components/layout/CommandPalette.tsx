import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Database, Search, Table2 } from 'lucide-react';
import clsx from 'clsx';

import { api } from '../../lib/api';
import { Badge, Kbd } from '../ui/Primitives';

const MAX_RESULTS = 12;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const databases = useQuery({
    queryKey: ['databases'],
    queryFn: ({ signal }) => api.listDatabases(signal),
    enabled: open,
  });

  // Carrega tabelas de todos os bancos disponíveis ao abrir (catálogos são pequenos
  // e ficam em cache) para permitir busca cross-database.
  const tableQueries = useQuery({
    queryKey: ['palette-tables', databases.data?.map((db) => db.id).join(',')],
    queryFn: async ({ signal }) => {
      const entries = await Promise.all(
        (databases.data ?? [])
          .filter((db) => db.exists)
          .map(async (db) => [db.id, await api.listTables(db.id, signal)] as const),
      );
      return Object.fromEntries(entries) as Record<string, { name: string; type: string }[]>;
    },
    enabled: open && Boolean(databases.data?.length),
    staleTime: 120_000,
  });

  interface Entry {
    key: string;
    label: string;
    hint: string;
    badge: string;
    action: () => void;
  }

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      {
        key: 'home',
        label: 'Ir para bancos de dados',
        hint: 'Início',
        badge: 'navegar',
        action: () => navigate('/'),
      },
    ];
    for (const db of databases.data ?? []) {
      list.push({
        key: `db-${db.id}`,
        label: db.name,
        hint: db.description || 'Banco de dados',
        badge: 'banco',
        action: () => navigate(`/db/${db.id}`),
      });
      for (const table of tableQueries.data?.[db.id] ?? []) {
        list.push({
          key: `t-${db.id}-${table.name}`,
          label: table.name,
          hint: `${db.name} · ${table.type === 'view' ? 'view' : 'tabela'}`,
          badge: 'tabela',
          action: () => navigate(`/db/${db.id}/tables/${encodeURIComponent(table.name)}`),
        });
      }
    }
    return list;
  }, [databases.data, tableQueries.data, navigate]);

  const filtered = useMemo(() => {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return entries.slice(0, MAX_RESULTS);
    return entries
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(normalized) ||
          entry.hint.toLowerCase().includes(normalized),
      )
      .slice(0, MAX_RESULTS);
  }, [entries, term]);

  useEffect(() => {
    if (open) {
      setTerm('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [term]);

  if (!open) return null;

  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    entry.action();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Busca rápida"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, filtered.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(filtered[cursor]);
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Buscar tabelas, bancos, ações…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={filtered[cursor] ? `palette-${filtered[cursor].key}` : undefined}
            className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {tableQueries.isLoading && (
            <li className="px-3 py-2 text-xs text-muted">Carregando catálogo…</li>
          )}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted">
              Nenhum resultado para “{term}”.
            </li>
          )}
          {filtered.map((entry, index) => (
            <li key={entry.key} id={`palette-${entry.key}`} role="option" aria-selected={index === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => run(entry)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                  index === cursor ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                )}
              >
                {entry.badge === 'banco' ? (
                  <Database className="h-4 w-4 text-accent" />
                ) : entry.badge === 'tabela' ? (
                  <Table2 className="h-4 w-4 text-subtle" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-subtle" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{entry.label}</span>
                  <span className="block truncate text-[11px] text-muted">{entry.hint}</span>
                </span>
                <Badge>{entry.badge}</Badge>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
          <span className="inline-flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
          <span className="ml-auto">{filtered.length} resultados</span>
        </div>
      </div>
    </div>
  );
}
