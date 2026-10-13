import Link from 'next/link';
import { listingHref, pageCount } from '@/lib/listing';

/** Numbered pages around the current one (crawlable links; first/last always shown). */
export function pageWindow(page, pages, radius = 2) {
  const set = new Set([1, pages]);
  for (let p = page - radius; p <= page + radius; p += 1) if (p >= 1 && p <= pages) set.add(p);
  const sorted = [...set].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['gap', p] : [p]));
}

export function ListingPagination({ path, listing, total, t }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  const { page } = listing;
  const href = (p) => listingHref(path, listing, { page: p });
  const cls = 'grid min-w-9 place-items-center rounded-md border px-3 py-1.5 text-sm';
  return (
    <nav
      aria-label={t('catalog.pagination')}
      className="flex flex-wrap items-center justify-center gap-1"
    >
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className={cls}>
          <span aria-hidden>‹</span>
          <span className="sr-only">{t('catalog.previous')}</span>
        </Link>
      )}
      {pageWindow(page, pages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${cls} ${p === page ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {p}
          </Link>
        ),
      )}
      {page < pages && (
        <Link href={href(page + 1)} rel="next" className={cls}>
          <span aria-hidden>›</span>
          <span className="sr-only">{t('catalog.next')}</span>
        </Link>
      )}
    </nav>
  );
}
