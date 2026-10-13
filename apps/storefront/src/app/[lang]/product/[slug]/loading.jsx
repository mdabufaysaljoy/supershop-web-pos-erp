'use client';

import { ProductPageSkeleton } from '@/components/catalog/Skeletons';
import { useT } from '@/i18n/I18nProvider';

/** Shown instantly while a product page renders for the first time (later visits are cached). */
export default function Loading() {
  const t = useT();
  return <ProductPageSkeleton label={t('catalog.loading')} />;
}
