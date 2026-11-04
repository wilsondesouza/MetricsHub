import { useState } from 'react';
import { Filter, Plus, Search, X } from 'lucide-react';

import type { ColumnInfo } from '../../lib/types';
import { Badge } from '../ui/Primitives';

export interface ActiveFilter {
  column: string;
  operator: string;
  value: string | null;
}

const OPERATORS: { value: string; label: string; needsValue: boolean }[] = [
  { value: 'eq', label: 'é igual a', needsValue: true },
  { value: 'ne', label: 'é diferente de', needsValue: true },
  { value: 'contains', label: 'contém', needsValue: true },
  { value: 'starts', label: 'começa com', needsValue: true },
  { value: 'gt', label: 'maior que', needsValue: true },
  { value: 'gte', label: 'maior ou igual', needsValue: true },
  { value: 'lt', label: 'menor que', needsValue: true },
  { value: 'lte', label: 'menor ou igual', needsValue: true },
  { value: 'is_null', label: 'é nulo', needsValue: false },
  { value: 'not_null', label: 'não é nulo', needsValue: false },
];

const OPERATOR_LABEL = Object.fromEntries(OPERATORS.map((op) => [op.value, op.label]));

interface FilterBarProps {
  columns: ColumnInfo[];
  search: string;
  onSearchChange: (value: string) => void;
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
}

export function FilterBar({ columns, search, onSearchChange, filters, onFiltersChange }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState(columns[0]?.name ?? '');
  const [operator, setOperator] = useState('eq');
  const [value, setValue] = useState('');

  const operatorMeta = OPERATORS.find((op) => op.value === operator);
  const canAdd = column && (operatorMeta?.needsValue ? value.trim().length > 0 : true);

  const addFilter = () => {
    if (!canAdd) return;
    onFiltersChange([...filters, { column, operator, value: operatorMeta?.needsValue ? value : null }]);
    setValue('');
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar em todas as colunas…"
            aria-label="Buscar na tabela"
            className="input pl-8 text-xs"
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {filters.length > 0 && <Badge tone="accent">{filters.length}</Badge>}
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-surface-sunken p-2">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-muted">
            Coluna
            <select
              value={column}
              onChange={(event) => setColumn(event.target.value)}
              className="rounded border bg-surface-raised px-2 py-1.5 text-xs text-ink"
            >
              {columns.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[130px] flex-1 flex-col gap-1 text-[11px] text-muted">
            Operador
            <select
              value={operator}
              onChange={(event) => setOperator(event.target.value)}
              className="rounded border bg-surface-raised px-2 py-1.5 text-xs text-ink"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </label>
          {operatorMeta?.needsValue && (
            <label className="flex min-w-[150px] flex-[2] flex-col gap-1 text-[11px] text-muted">
              Valor
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addFilter();
                }}
                placeholder="valor exato ou parte do texto"
                className="rounded border bg-surface-raised px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </label>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={addFilter} disabled={!canAdd}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
      )}

      {filters.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Filtros ativos">
          {filters.map((filter, index) => (
            <li key={`${filter.column}-${filter.operator}-${index}`}>
              <span className="chip gap-1.5 py-1">
                <span className="font-mono text-ink">{filter.column}</span>
                <span>{OPERATOR_LABEL[filter.operator] ?? filter.operator}</span>
                {filter.value !== null && (
                  <span className="max-w-[140px] truncate font-mono text-accent">{filter.value}</span>
                )}
                <button
                  type="button"
                  onClick={() => onFiltersChange(filters.filter((_, i) => i !== index))}
                  className="rounded p-0.5 hover:bg-surface-hover"
                  aria-label={`Remover filtro de ${filter.column}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="text-[11px] text-muted underline hover:text-ink"
              onClick={() => onFiltersChange([])}
            >
              limpar todos
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
