import { cn } from '@/lib/utils';

export const Skeleton = ({ className, ...props }) => (
  <div
    data-slot="skeleton"
    className={cn('animate-pulse rounded-md bg-accent', className)}
    {...props}
  />
);
