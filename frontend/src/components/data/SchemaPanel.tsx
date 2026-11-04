import { useState } from 'react';
import { Columns3, Fingerprint, GitBranch, KeyRound, Link2 } from 'lucide-react';

import type { TableSchema } from '../../lib/types';
import { Badge } from '../ui/Primitives';

export function SchemaPanel({ schema }: { schema: TableSchema }) {
  const [tab, setTab] = useState<'columns' | 'indexes' | 'relations'>('columns');

  return (
    <div>
      <div role="tablist" aria-label="Detalhes do schema" className="flex gap-1 border-b px-2 pt-2">
        {[
          { id: 'columns' as const, label: `Colunas (${schema.columns.length})`, icon: Columns3 },
          { id: 'indexes' as const, label: `Índices (${schema.indexes.length})`, icon: Fingerprint },
          { id: 'relations' as const, label: `Relações (${schema.foreign_keys.length})`, icon: GitBranch },
        ].map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs transition-colors ${
              tab === item.id
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'columns' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted">
              <tr className="border-b">
                <th scope="col" className="px-3 py-1.5 font-medium">Coluna</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Tipo declarado</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Afinidade</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Restrições</th>
                <th scope="col" className="px-3 py-1.5 font-medium">Default</th>
              </tr>
            </thead>
            <tbody>
              {schema.columns.map((column) => (
                <tr key={column.name} className="border-b last:border-0 hover:bg-surface-hover">
                  <td className="px-3 py-1.5 font-mono text-ink">
                    <span className="inline-flex items-center gap-1">
                      {column.primary_key && <KeyRound className="h-3 w-3 text-warn" />}
                      {column.name}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-subtle">{column.type || '—'}</td>
                  <td className="px-3 py-1.5">
                    <Badge>{column.kind}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-subtle">
                    {[column.primary_key && 'PK', column.not_null && 'NOT NULL']
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted">{column.default ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'indexes' && (
        <ul className="divide-y">
          {schema.indexes.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted">
              Nenhum índice declarado. Consultas com filtros podem ficar lentas em tabelas grandes.
            </li>
          )}
          {schema.indexes.map((index) => (
            <li key={index.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <Fingerprint className="h-3.5 w-3.5 text-muted" />
              <span className="font-mono text-ink">{index.name}</span>
              {index.unique && <Badge tone="accent">único</Badge>}
              {index.origin === 'pk' && <Badge tone="warn">chave primária</Badge>}
              {index.partial && <Badge tone="info">parcial</Badge>}
              <span className="ml-auto inline-flex items-center gap-1 text-muted">
                <Link2 className="h-3 w-3" />
                {index.columns.join(', ') || '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {tab === 'relations' && (
        <ul className="divide-y">
          {schema.foreign_keys.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted">
              Nenhuma chave estrangeira declarada nesta tabela.
            </li>
          )}
          {schema.foreign_keys.map((fk) => (
            <li key={`${fk.id}-${fk.from}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="font-mono text-ink">{fk.from}</span>
              <span className="text-muted">→</span>
              <span className="font-mono text-accent">{fk.table}</span>
              <span className="font-mono text-muted">({fk.to ?? 'rowid'})</span>
              <span className="ml-auto text-[10px] text-muted">
                ON UPDATE {fk.on_update} · ON DELETE {fk.on_delete}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
