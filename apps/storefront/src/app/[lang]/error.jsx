'use client';

import { useT } from '@/i18n/I18nProvider';

/** Error boundary for pages (rendered inside the layout, so the language provider is available). */
export default function ErrorBoundary({ reset }) {
  const t = useT();
  return (
    <section role="alert" className="grid max-w-xl gap-3 py-16">
      <h1 className="text-2xl font-semibold">{t('error.title')}</h1>
      <p className="text-muted-foreground">{t('error.body')}</p>
      <p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t('error.retry')}
        </button>
      </p>
    </section>
  );
}
