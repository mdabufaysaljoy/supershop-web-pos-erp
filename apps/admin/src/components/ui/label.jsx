import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm font-medium leading-none select-none',
        className,
      )}
      {...props}
    />
  );
}
