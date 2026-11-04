import { BarChart3 } from 'lucide-react';

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
      <BarChart3 className="h-6 w-6 text-muted" aria-hidden />
      <p className="max-w-xs px-4 text-xs text-subtle">{message}</p>
    </div>
  );
}
