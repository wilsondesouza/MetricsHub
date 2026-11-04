import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, ShieldAlert, Table2 } from 'lucide-react';

import { ApiError, getStoredToken } from '../lib/api';
import { describeCell } from '../lib/format';
import { Badge, EmptyState, Section } from '../components/ui/Primitives';

interface Result {
  columns: string[];
  rows: (string | number | null)[][];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
}

export function SqlPage() {
  const { dbId = '' } = useParams();
  const [sql, setSql] = useState('SELECT name, type\nFROM sqlite_master\nWHERE type IN (\'table\', \'view\')\nORDER BY name;');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/sql/${encodeURIComponent(dbId)}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getStoredToken() ? { 'X-API-Token': getStoredToken() } : {}),
        },
        body: JSON.stringify({ sql, limit: 200 }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new ApiError(
          response.status,
          body?.error?.code ?? 'error',
          body?.error?.message ?? 'Falha ao executar',
        );
      }
      setResult(body as Result);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'Erro inesperado');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <header>
        <nav aria-label="Trilha" className="flex items-center gap-1 text-[11px] text-muted">
          <Link to={`/db/${dbId}`} className="hover:text-ink">{dbId}</Link>
          <span aria-hidden>/</span>
          <span>sql</span>
        </nav>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Editor SQL</h1>
        <p className="mt-0.5 text-xs text-subtle">
          Somente leitura: apenas uma instrução <code className="font-mono">SELECT</code>/<code className="font-mono">WITH</code>,
          executada em conexão <code className="font-mono">mode=ro</code> com autorizador que bloqueia escrita,
          DDL e <code className="font-mono">ATTACH</code>.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] text-subtle">
        <ShieldAlert className="h-3.5 w-3.5 text-warn" />
        Este recurso é opt-in (<code className="font-mono">METRICHUB_ALLOW_RAW_SQL=1</code>) e deve ficar desligado
        em ambientes expostos. Consultas têm timeout curto e retornam no máximo 500 linhas.
      </div>

      <Section title="Consulta" actions={<Badge>{dbId}</Badge>}>
        <div className="p-3">
          <textarea
            value={sql}
            onChange={(event) => setSql(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void run();
              }
            }}
            spellCheck={false}
            rows={7}
            aria-label="Consulta SQL"
            className="w-full resize-y rounded-lg border bg-surface-sunken p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted">Ctrl/⌘ + Enter para executar</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void run()} disabled={running}>
              <Play className="h-3.5 w-3.5" />
              {running ? 'Executando…' : 'Executar'}
            </button>
          </div>
        </div>
      </Section>

      {error && (
        <div role="alert" className="card border-danger/40 p-4 text-xs text-danger">
          {error}
        </div>
      )}

      <Section
        title="Resultado"
        description={result ? `${result.row_count} linhas · ${result.duration_ms} ms${result.truncated ? ' · truncado' : ''}` : undefined}
        actions={result?.truncated ? <Badge tone="warn">truncado</Badge> : undefined}
      >
        {!result && !error && (
          <EmptyState icon={<Table2 />} title="Sem resultado" description="Execute uma consulta para ver os dados aqui." />
        )}
        {result && (
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="table-sticky">
                <tr>
                  {result.columns.map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap border-b px-3 py-2 font-mono text-[11px] font-medium text-subtle">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index} className="border-b hover:bg-surface-hover">
                    {row.map((value, cellIndex) => {
                      const cell = describeCell(value as never);
                      return (
                        <td
                          key={cellIndex}
                          className={`max-w-[280px] truncate px-3 py-1.5 ${cell.tone === 'number' ? 'text-right font-mono' : ''}`}
                          title={cell.title}
                        >
                          {cell.display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
