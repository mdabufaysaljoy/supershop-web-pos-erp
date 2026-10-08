import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/format';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

/** Thumbnail grid; each tile opens the details dialog. */
export function MediaGrid({ items, loading, onOpen }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('media.empty')}</p>;
  }
  return (
    <ul className={GRID}>
      {items.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onOpen(m.id)}
            className="group grid w-full gap-1 rounded-lg border p-2 text-start outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
              <img
                src={m.variants.thumb?.url ?? m.url}
                alt={m.alt?.en ?? ''}
                loading="lazy"
                decoding="async"
                width={m.variants.thumb?.width}
                height={m.variants.thumb?.height}
                className="max-h-full max-w-full object-contain"
              />
            </span>
            <span className="truncate text-sm font-medium" title={m.name}>
              {m.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('media.dimensions', { width: m.width, height: m.height })} · {formatBytes(m.bytes)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
