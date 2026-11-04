import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MetricsHub] erro não tratado na UI:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
        <div className="card w-full max-w-md p-6 text-center">
          <AlertOctagon className="mx-auto h-8 w-8 text-danger" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold text-ink">Algo saiu do esperado</h1>
          <p className="mt-2 text-sm text-subtle">
            A interface encontrou um erro inesperado. Recarregue a página — se persistir, verifique
            os logs do servidor.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-sunken p-3 text-left text-xs text-muted">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={() => window.location.reload()}
          >
            Recarregar aplicação
          </button>
        </div>
      </div>
    );
  }
}
