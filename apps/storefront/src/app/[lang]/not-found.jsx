'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale, localizePath } from '@/i18n/config';
import ar from '@/i18n/dictionaries/ar.json';
import en from '@/i18n/dictionaries/en.json';

/**
 * 404 inside the language layout (HTTP 404). Client component: not-found receives no params, and
 * reading request headers on the server would force every page in this segment to be dynamic
 * (losing static/ISR rendering). Dictionaries here are small JSON files.
 */
const DICTS = { en, ar };

export default function NotFound() {
  const params = useParams();
  const lang = isLocale(params?.lang) ? params.lang : DEFAULT_LOCALE;
  const t = (key) => DICTS[lang]?.notFound?.[key] ?? en.notFound[key];
  return (
    <section className="grid max-w-xl gap-3 py-16">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('body')}</p>
      <p>
        <Link href={localizePath('/', lang)} className="font-medium underline underline-offset-4">
          {t('back')}
        </Link>
      </p>
    </section>
  );
}
