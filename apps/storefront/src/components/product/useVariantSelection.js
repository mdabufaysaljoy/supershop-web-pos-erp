'use client';

import { useEffect, useState } from 'react';
import { galleryFor, initialSelection, selectedVariant, selectionWith } from './variants';

/**
 * Selected options → variant, gallery and image index. `syncUrl` keeps `?variant=` in the address
 * bar (product page: shareable, restored after hydration so the server render stays cacheable).
 * `start` = `{ optionKey, valueKey }` to preselect a value (e.g. the swatch chosen on a card).
 */
export function useVariantSelection(product, { syncUrl = false, start = null } = {}) {
  const [selection, setSelection] = useState(() => {
    const base = initialSelection(product, null);
    return start ? selectionWith(product, base, start.optionKey, start.valueKey) : base;
  });
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (!syncUrl) return;
    const id = new URLSearchParams(window.location.search).get('variant');
    if (id && product.variants.some((v) => v.id === id)) {
      setSelection(initialSelection(product, id)); // eslint-disable-line react-hooks/set-state-in-effect -- reads the URL
    }
  }, [product, syncUrl]);

  const variant = selectedVariant(product, selection);
  const images = galleryFor(product, variant);
  const image = images[Math.min(imageIndex, images.length - 1)] ?? null;

  const choose = (optionKey, valueKey) => {
    const sel = selectionWith(product, selection, optionKey, valueKey);
    setSelection(sel);
    setImageIndex(0);
    const chosen = selectedVariant(product, sel);
    if (syncUrl && chosen) {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', chosen.id);
      window.history.replaceState(window.history.state, '', url);
    }
  };

  return { selection, variant, images, image, setImageIndex, choose };
}
