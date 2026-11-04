import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';

/* ------------------------------------------------------------------ Skeleton */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx('skeleton', className)} style={style} aria-hidden />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={clsx('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Spinner */
export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-subtle">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ Badge */
type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface-sunken text-subtle',
  accent: 'border-accent/30 bg-accent-soft text-accent',
  ok: 'border-ok/30 bg-ok/10 text-ok',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/30 bg-info/10 text-info',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ EmptyState */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-muted [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-subtle">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ ErrorState */
export function ErrorState({
  title = 'Não foi possível carregar',
  message,
  onRetry,
  hint,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  hint?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-danger" aria-hidden />
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-md text-xs text-subtle">{message}</p>
      {hint && <p className="max-w-md text-[11px] text-muted">{hint}</p>}
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          'card max-h-[85dvh] w-full animate-slide-up overflow-hidden rounded-b-none sm:rounded-xl',
          width,
        )}
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Fechar"
            autoFocus
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[calc(85dvh-3.25rem)] overflow-auto">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Kbd */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ LinkButton */
export function RouterButton({
  to,
  children,
  variant = 'ghost',
}: {
  to: string;
  children: ReactNode;
  variant?: 'ghost' | 'primary';
}) {
  return (
    <Link
      to={to}
      className={clsx(
        'btn',
        variant === 'primary' ? 'btn-primary' : 'btn-ghost',
        'no-underline decoration-transparent hover:no-underline',
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ Section */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  ...rest
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section className={clsx('card overflow-hidden', className)} {...rest}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-subtle">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ IconButton */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('btn btn-ghost btn-icon', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
