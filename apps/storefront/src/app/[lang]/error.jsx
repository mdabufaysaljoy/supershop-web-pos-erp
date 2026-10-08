'use client';

import { useParams } from 'next/navigation';
import en from '@/i18n/dictionaries/en.json';
import ar from '@/i18n/dictionaries/ar.json';

// Error boundaries must be client components; dictionaries are tiny JSON so bundling is fine.
const DICTS = { en, ar };

export default function ErrorBoundary({ reset }) {
  const { lang } = useParams();
  const t = (key) => DICTS[lang]?.error?.[key] ?? en.error[key];
  return (
    <section role="alert" className="grid max-w-xl gap-3 py-16">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('body')}</p>
      <p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t('retry')}
        </button>
      </p>
    </section>
  );
}
