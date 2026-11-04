import type { CellValue, ColumnKind } from './types';

const numberFormat = new Intl.NumberFormat('pt-BR');
const compactFormat = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const decimalFormat = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatCompact(value: number): string {
  return Math.abs(value) >= 10_000 ? compactFormat.format(value) : numberFormat.format(value);
}

export function formatDecimal(value: number, unit = ''): string {
  return `${decimalFormat.format(value)}${unit ? ` ${unit}` : ''}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.01 ? 2 : 1)}%`;
}

export function formatRelative(date: Date | string | number): string {
  const target = date instanceof Date ? date : new Date(date);
  const diffMs = target.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'agora';
}

export function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type CellTone = 'null' | 'number' | 'text' | 'date' | 'blob' | 'boolean';

export interface CellView {
  display: string;
  title: string;
  tone: CellTone;
  align: 'left' | 'right';
  copyValue: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

export function describeCell(value: CellValue, kind?: ColumnKind): CellView {
  if (value === null || value === undefined) {
    return { display: 'NULL', title: 'Valor nulo', tone: 'null', align: 'left', copyValue: '' };
  }
  if (typeof value === 'object' && '__type' in value) {
    return {
      display: `<BLOB ${formatBytes(value.size)}>`,
      title: `Binário de ${formatBytes(value.size)}\nprévia hex: ${value.preview}`,
      tone: 'blob',
      align: 'left',
      copyValue: value.preview,
    };
  }
  if (typeof value === 'number' || kind === 'integer' || kind === 'real' || kind === 'number') {
    if (typeof value === 'number') {
      return {
        display: Number.isInteger(value) ? formatNumber(value) : formatDecimal(value),
        title: String(value),
        tone: 'number',
        align: 'right',
        copyValue: String(value),
      };
    }
  }
  if (typeof value === 'boolean') {
    return {
      display: value ? 'true' : 'false',
      title: String(value),
      tone: 'boolean',
      align: 'left',
      copyValue: String(value),
    };
  }
  const text = String(value);
  if (ISO_DATE.test(text)) {
    return {
      display: text.length > 10 ? formatDateTime(text) : text.split('-').reverse().join('/'),
      title: text,
      tone: 'date',
      align: 'left',
      copyValue: text,
    };
  }
  return { display: text, title: text, tone: 'text', align: 'left', copyValue: text };
}

export function truncate(text: string, max = 64): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function percentOf(value: number, total: number): number {
  return total > 0 ? Math.min(100, (value / total) * 100) : 0;
}
