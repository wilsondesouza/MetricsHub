import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Estado persistido na URL (hash), para que filtros/página/ordenação sejam
 * compartilháveis e sobrevivam a recarregamentos — sem depender de router.
 * Gravação é debounced para não poluir o histórico a cada tecla.
 */
export function useHashState<T extends Record<string, string>>(
  defaults: T,
  namespace: string,
): [T, (patch: Partial<T>) => void] {
  const read = useCallback((): T => {
    const params = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
    const state = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = params.get(`${namespace}.${String(key)}`);
      if (value !== null) state[key] = value as T[keyof T];
    }
    return state;
  }, [defaults, namespace]);

  const [state, setState] = useState<T>(read);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback(
    (patch: Partial<T>) => {
      setState((current) => ({ ...current, ...patch }));
    },
    [],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
      for (const key of Object.keys(defaults) as (keyof T)[]) {
        const value = stateRef.current[key];
        const paramKey = `${namespace}.${String(key)}`;
        if (!value || value === defaults[key]) params.delete(paramKey);
        else params.set(paramKey, value);
      }
      const next = params.toString();
      const newHash = next ? `#${next}` : '';
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', `${window.location.pathname}${newHash}`);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, defaults, namespace]);

  return useMemo(() => [state, update], [state, update]);
}
