'use client';

import { ListingSkeleton } from '@/components/catalog/Skeletons';
import { useT } from '@/i18n/I18nProvider';

/**
 * Shown instantly while a listing renders. Loading UIs get no route params, so this is a client
 * component using the active-language strings from the layout.
 */
export default function Loading() {
  const t = useT();
  return <ListingSkeleton label={t('catalog.loading')} />;
}
