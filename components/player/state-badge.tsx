import { cn } from '@/lib/utils/cn';

export function StateBadge({ state, className }: { state: string | null | undefined; className?: string }) {
  if (!state) return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800',
        className,
      )}
      title={`UF: ${state.toUpperCase()}`}
    >
      {state.toUpperCase()}
    </span>
  );
}
