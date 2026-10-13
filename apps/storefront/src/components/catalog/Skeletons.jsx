import { cn } from '@/lib/cn';

/**
 * Loading placeholders shaped like the real content (no layout jump when it arrives). The pulse
 * stops for visitors who prefer reduced motion. Server-renderable (used by loading.jsx files).
 */
export const Bone = ({ className }) => (
  <span
    className={cn('block animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
  />
);

export function ProductCardSkeleton() {
  return (
    <div className="grid content-start gap-2" aria-hidden>
      <Bone className="aspect-square rounded-lg" />
      <Bone className="h-3 w-1/3" />
      <Bone className="h-4 w-4/5" />
      <Bone className="h-4 w-1/2" />
      <Bone className="mt-1 h-9 rounded-full" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Category / search page while results load. */
export function ListingSkeleton({ label }) {
  return (
    <div className="grid gap-6" role="status" aria-label={label}>
      <Bone className="h-4 w-48" />
      <Bone className="h-9 w-64" />
      <div className="grid gap-6 md:grid-cols-[15rem_1fr]">
        <div className="hidden gap-3 md:grid md:content-start">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-4" />
          ))}
        </div>
        <div className="grid gap-6">
          <div className="flex justify-between">
            <Bone className="h-4 w-32" />
            <Bone className="h-9 w-40" />
          </div>
          <ProductGridSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Product page while it renders. */
export function ProductPageSkeleton({ label }) {
  return (
    <div className="grid gap-10" role="status" aria-label={label}>
      <Bone className="h-4 w-64" />
      <ProductQuickSkeleton />
    </div>
  );
}

/** Gallery + details placeholder (product page and quick view). */
export function ProductQuickSkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-2" aria-hidden>
      <Bone className="aspect-square rounded-xl" />
      <div className="grid content-start gap-4">
        <Bone className="h-4 w-24" />
        <Bone className="h-8 w-3/4" />
        <Bone className="h-7 w-32" />
        <div className="flex gap-2">
          <Bone className="size-10 rounded-full" />
          <Bone className="size-10 rounded-full" />
          <Bone className="size-10 rounded-full" />
        </div>
        <Bone className="h-11 w-56 rounded-full" />
      </div>
    </div>
  );
}
