'use client';

import { localizeBlocks } from '@supershop/shared';
import { useMemo, useState } from 'react';
import { BlockRenderer } from './BlockRenderer.jsx';
import { cn } from '../lib/cn.js';

/**
 * A page as a visitor would see it, in either language (P5.1). The admin builder (P5.2) drops this
 * next to the canvas; the EN/AR toggle switches language AND direction, which is the only honest
 * way to check a layout that must work both ways (§5.7 RTL).
 *
 * `languages` are already-translated option labels: this package stays i18n-agnostic (D-040).
 */
export function PagePreview({
  content,
  texts = [],
  components,
  context = {},
  languages = [
    { code: 'en', label: 'English', rtl: false },
    { code: 'ar', label: 'العربية', rtl: true },
  ],
  initialLang = 'en',
  label = 'Preview',
  className,
}) {
  const [lang, setLang] = useState(initialLang);
  const active = languages.find((l) => l.code === lang) ?? languages[0];
  const blocks = useMemo(
    () => localizeBlocks(content?.blocks ?? [], texts, active.code),
    [content, texts, active.code],
  );

  return (
    <div className={cn('grid gap-3', className)}>
      <div role="group" aria-label={label} className="flex gap-1 justify-self-end">
        {languages.map((option) => (
          <button
            key={option.code}
            type="button"
            aria-pressed={option.code === active.code}
            onClick={() => setLang(option.code)}
            className="rounded-md border px-3 py-1 text-xs aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        lang={active.code}
        dir={active.rtl ? 'rtl' : 'ltr'}
        className="grid gap-6 rounded-xl border bg-background p-6"
      >
        <BlockRenderer
          blocks={blocks}
          components={components}
          context={{ ...context, lang: active.code }}
        />
      </div>
    </div>
  );
}
