import { cn } from '@/lib/utils';

/** Small status pill. */
export function Badge({ tone = 'muted', children }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    ok: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-900',
    bad: 'bg-red-100 text-red-800',
  };
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}
