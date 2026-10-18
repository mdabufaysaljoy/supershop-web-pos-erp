import { Dialog as D } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Side panel (mobile navigation). Opens from the inline-start edge, so it mirrors in RTL. */
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetTitle = ({ className, ...props }) => (
  <D.Title className={cn('sr-only', className)} {...props} />
);
export const SheetDescription = ({ className, ...props }) => (
  <D.Description className={cn('sr-only', className)} {...props} />
);

export function SheetContent({ className, children, closeLabel, side = 'start', ...props }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <D.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 z-50 flex h-full flex-col bg-sidebar shadow-lg outline-none',
          side === 'end' ? 'end-0 border-s' : 'start-0 border-e',
          className || 'w-72',
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
