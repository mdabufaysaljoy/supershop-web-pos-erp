import { cn } from '@/lib/cn';

/**
 * Responsive image from the media library. The API already stores WebP in several widths
 * (thumb 320 / md 800 / lg 1600 / full), exposed as `image.sources` — so the browser picks the
 * right size via `srcset` + `sizes` without a second optimization step (D-094).
 * Width/height are always set (no layout shift); below-the-fold images load lazily.
 * @param {{ image: { url: string, width: number, height: number, alt?: string,
 *   sources?: { url: string, width: number }[] } | null, alt?: string, sizes: string,
 *   priority?: boolean, className?: string }} props
 */
export function MediaImage({ image, alt, sizes, priority = false, className }) {
  if (!image?.url) {
    return <div className={cn('bg-muted', className)} role="presentation" />;
  }
  const srcSet = image.sources?.length
    ? image.sources.map((s) => `${s.url} ${s.width}w`).join(', ')
    : undefined;
  return (
    <img
      src={image.url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
    />
  );
}
