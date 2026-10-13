import { cn } from '@/lib/utils';

/** Signed stock change: +5 green, −3 red, 0 muted. LTR so the sign stays in front. */
export function Delta({ value }) {
  return (
    <span
      dir="ltr"
      className={cn(
        'font-medium tabular-nums',
        value > 0 ? 'text-emerald-700' : value < 0 ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  );
}
