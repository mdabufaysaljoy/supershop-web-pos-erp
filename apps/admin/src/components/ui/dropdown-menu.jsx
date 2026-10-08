import { DropdownMenu as DM } from 'radix-ui';
import { cn } from '@/lib/utils';

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }) {
  return (
    <DM.Portal>
      <DM.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }) {
  return (
    <DM.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenuLabel = ({ className, ...props }) => (
  <DM.Label className={cn('px-2 py-1.5 text-sm font-medium', className)} {...props} />
);
export const DropdownMenuSeparator = ({ className, ...props }) => (
  <DM.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
);
