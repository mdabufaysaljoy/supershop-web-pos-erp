import { Dialog as D } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Modal dialog (shadcn pattern on Radix). Centered, so it needs no RTL mirroring. */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export const DialogTitle = ({ className, ...props }) => (
  <D.Title className={cn('text-lg font-semibold', className)} {...props} />
);
export const DialogDescription = ({ className, ...props }) => (
  <D.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export function DialogContent({ className, children, closeLabel, ...props }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <D.Content
        className={cn(
          'fixed start-1/2 top-1/2 z-50 grid max-h-[90svh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg outline-none rtl:translate-x-1/2',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close
          className="absolute end-4 top-4 rounded-sm opacity-70 hover:opacity-100"
          aria-label={closeLabel}
        >
          <XIcon className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
