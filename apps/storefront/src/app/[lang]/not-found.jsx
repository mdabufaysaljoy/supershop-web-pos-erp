'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';

/**
 * 404 inside the language layout (HTTP 404). Client component so pages in this segment stay
 * statically renderable; strings come from the active-language provider (no other language shipped).
 */
export default function NotFound() {
  const t = useT();
  const lang = useLang();
  return (
    <section className="grid max-w-xl gap-3 py-16">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.body')}</p>
      <p>
        <Link href={localizePath('/', lang)} className="font-medium underline underline-offset-4">
          {t('notFound.back')}
        </Link>
      </p>
    </section>
  );
}
