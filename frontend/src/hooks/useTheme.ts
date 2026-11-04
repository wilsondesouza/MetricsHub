import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'metricshub:theme';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

function applyResolved(theme: Theme): void {
  const resolved = resolve(theme);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b0f14' : '#f6f8fb');
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      return stored ?? 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    applyResolved(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage indisponível */
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyResolved('system');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggle = useCallback(
    () => setThemeState((current) => (resolve(current) === 'dark' ? 'light' : 'dark')),
    [],
  );

  return { theme, resolved: resolve(theme), setTheme, toggle };
}
