import { useEffect, useState } from 'react';

/** Lê os tokens CSS para os gráficos acompanharem o tema sem duplicar cores. */
export function useChartTheme() {
  const [theme, setTheme] = useState(() => readTheme());

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readTheme() {
  return {
    grid: cssVar('--grid', 'rgba(148,163,184,0.12)'),
    text: cssVar('--text-subtle', '#a9b6c6'),
    textStrong: cssVar('--text', '#e8edf4'),
    surface: cssVar('--surface-raised', '#121821'),
    border: cssVar('--border', '#232c38'),
    accent: cssVar('--accent', '#38bdf8'),
    ok: cssVar('--ok', '#34d399'),
    warn: cssVar('--warn', '#fbbf24'),
    danger: cssVar('--danger', '#f87171'),
    info: cssVar('--info', '#a78bfa'),
  };
}

export const SERIES_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee'];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] as string;
}

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(0)}k`;
  return numberFormat.format(value);
}

export const tooltipProps = {
  contentStyle: {
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    boxShadow: '0 12px 32px -16px rgb(0 0 0 / 0.6)',
    fontSize: 12,
    color: 'var(--text)',
    padding: '8px 10px',
  },
  labelStyle: { color: 'var(--text-subtle)', fontSize: 11, marginBottom: 4 },
  itemStyle: { color: 'var(--text)', fontSize: 12, padding: 0 },
  wrapperStyle: { outline: 'none' },
} as const;
