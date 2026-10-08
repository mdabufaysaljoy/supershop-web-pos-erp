import { useFieldControlProps } from '@supershop/ui';
import { cn } from '@/lib/utils';

/** Native select styled like inputs (accessible by default; picks up FormField wiring). */
export function Select({ className, children, ...props }) {
  const field = useFieldControlProps();
  return (
    <select
      {...field}
      {...props}
      className={cn(
        'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
    >
      {children}
    </select>
  );
}

/** Labelled checkbox row. */
export function Checkbox({ label, description, id, ...props }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-0.5 size-4 accent-primary" {...props} />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}

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
