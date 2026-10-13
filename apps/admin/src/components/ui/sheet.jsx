import { Dialog as D } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Side panel (mobile navigation). Opens from the inline-start edge, so it mirrors in RTL. */
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetTitle = ({ className, ...props }) => (
  <D.Title className={cn('sr-only', className)} {...props} />
);

export function SheetContent({ className, children, closeLabel, ...props }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <D.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex h-full w-72 flex-col border-e bg-sidebar shadow-lg outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close
          className="absolute end-3 top-3 rounded-sm opacity-70 hover:opacity-100"
          aria-label={closeLabel}
        >
          <XIcon className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
