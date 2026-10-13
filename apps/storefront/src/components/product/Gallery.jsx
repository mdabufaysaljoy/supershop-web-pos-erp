'use client';

import { AnimatePresence, m } from 'motion/react';
import { MediaImage } from '@/components/catalog/MediaImage';
import { useT } from '@/i18n/I18nProvider';

/** Main image (cross-fades when it changes) + thumbnails. */
export function Gallery({ images, image, onSelect, name, priority = false, sizes }) {
  const t = useT();
  return (
    <div className="grid content-start gap-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={image?.id ?? 'none'}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <MediaImage
              image={image}
              alt={name}
              sizes={sizes}
              priority={priority}
              className="size-full object-contain"
            />
          </m.div>
        </AnimatePresence>
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t('catalog.gallery')}>
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-label={t('catalog.showImage', { n: i + 1 })}
                aria-current={img === image ? 'true' : undefined}
                className="block size-16 overflow-hidden rounded-md border-2 border-transparent transition-colors aria-[current]:border-primary"
              >
                <MediaImage image={img} alt="" sizes="64px" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
