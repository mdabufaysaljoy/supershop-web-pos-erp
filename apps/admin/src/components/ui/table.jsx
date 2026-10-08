import { cn } from '@/lib/utils';

/** shadcn table. The wrapper scrolls horizontally on narrow screens instead of the page. */
export const Table = ({ className, ...props }) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
  </div>
);
export const TableHeader = ({ className, ...props }) => (
  <thead className={cn('[&_tr]:border-b', className)} {...props} />
);
export const TableBody = ({ className, ...props }) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);
export const TableRow = ({ className, ...props }) => (
  <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />
);
export const TableHead = ({ className, ...props }) => (
  <th
    className={cn(
      'h-10 whitespace-nowrap px-2 text-start align-middle font-medium text-muted-foreground',
      className,
    )}
    {...props}
  />
);
export const TableCell = ({ className, ...props }) => (
  <td className={cn('whitespace-nowrap p-2 align-middle', className)} {...props} />
);
