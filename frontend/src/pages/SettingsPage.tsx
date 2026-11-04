import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';

import { api, getStoredToken, setStoredToken } from '../lib/api';
import { useTheme, type Theme } from '../hooks/useTheme';
import { Badge, Section } from '../components/ui/Primitives';
import { useToast } from '../components/ui/Toast';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [token, setToken] = useState(getStoredToken());
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal) });

  const save = () => {
    setStoredToken(token.trim());
    toast.success('Token salvo', 'Ele é enviado no header X-API-Token em cada requisição.');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-subtle">Preferências locais deste navegador.</p>
      </header>

      <Section title="Aparência" description="A preferência é salva localmente">
        <div className="flex gap-2 p-4">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={theme === option.value}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors ${
                theme === option.value
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'text-subtle hover:border-border-strong'
              }`}
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Acesso à API"
        description="Necessário apenas quando o servidor roda com auth_mode = token"
        actions={
          <Badge tone={health.data?.auth_mode === 'token' ? 'accent' : 'neutral'}>
            servidor: {health.data?.auth_mode ?? '—'}
          </Badge>
        }
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-[11px] text-subtle">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
            <p>
              O token fica em <code className="font-mono">localStorage</code> e é enviado somente para o
              próprio MetricsHub. Prefira servir a aplicação por HTTPS e use tokens curtos e revogáveis.
            </p>
          </div>
          <label className="block text-xs text-subtle">
            Token de API
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="cole o token gerado no servidor"
                  autoComplete="off"
                  className="input pl-8 font-mono text-xs"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={save}>
                Salvar
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setToken('');
                  setStoredToken('');
                  toast.info('Token removido');
                }}
              >
                Limpar
              </button>
            </div>
          </label>
        </div>
      </Section>

      <Section title="Sobre" description="MetricsHub v2">
        <dl className="grid grid-cols-2 gap-3 p-4 text-xs">
          <dt className="text-muted">Servidor</dt>
          <dd className="font-mono text-ink">v{health.data?.version ?? '—'}</dd>
          <dt className="text-muted">Bancos disponíveis</dt>
          <dd className="font-mono text-ink">
            {health.data ? `${health.data.databases.available}/${health.data.databases.total}` : '—'}
          </dd>
          <dt className="text-muted">Editor SQL</dt>
          <dd className="text-ink">{health.data?.features.raw_sql ? 'habilitado' : 'desabilitado'}</dd>
          <dt className="text-muted">Exportações</dt>
          <dd className="text-ink">{health.data?.features.downloads ? 'habilitadas' : 'desabilitadas'}</dd>
        </dl>
      </Section>
    </div>
  );
}
