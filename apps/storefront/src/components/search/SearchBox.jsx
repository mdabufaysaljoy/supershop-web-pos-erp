'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { categoryPath, productPath } from '@/lib/categories';

const DEBOUNCE_MS = 200;

/**
 * Header search with suggestions (WAI-ARIA combobox): type → products + categories from
 * `/api/v1/search/suggest` (same origin; debounced, stale responses ignored). Arrow keys move,
 * Enter opens the highlighted suggestion or runs the search, Escape closes. Works as a plain
 * GET form without JavaScript.
 */
export function SearchBox({ initialQuery = '' }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState(initialQuery);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    const n = (seq.current += 1);
    if (text.length < 2) {
      setItems([]); // eslint-disable-line react-hooks/set-state-in-effect
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/search/suggest?${new URLSearchParams({ q: text, lang })}`,
          { headers: { Accept: 'application/json' } },
        );
        const body = res.ok ? await res.json() : { data: [] };
        if (n === seq.current) {
          setItems(body.data ?? []);
          setActive(-1);
        }
      } catch {
        if (n === seq.current) setItems([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, lang]);

  const hrefOf = (item) =>
    localizePath(item.type === 'category' ? categoryPath(item.slug) : productPath(item.slug), lang);
  const searchHref = () =>
    `${localizePath('/search', lang)}?${new URLSearchParams({ q: q.trim() })}`;
  const showList = open && items.length > 0;

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <form
      role="search"
      action={localizePath('/search', lang)}
      method="get"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        if (showList && active >= 0) router.push(hrefOf(items[active]));
        else if (q.trim()) router.push(searchHref());
      }}
    >
      <input
        type="search"
        name="q"
        value={q}
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-label={t('search.label')}
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
        placeholder={t('search.placeholder')}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-full border bg-muted/50 px-4 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-ring/50"
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={t('search.suggestions')}
        hidden={!showList}
        className="absolute inset-x-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-lg border bg-background p-1 shadow-lg"
      >
        {items.map((item, i) => (
          <li
            key={`${item.type}-${item.id}`}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              router.push(hrefOf(item));
            }}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-muted hover:bg-muted"
          >
            {item.type === 'product' && item.image ? (
              <img
                src={item.image}
                alt=""
                width={36}
                height={36}
                className="size-9 rounded object-cover"
              />
            ) : (
              <span className="size-9 shrink-0 rounded bg-muted" aria-hidden />
            )}
            <span className="flex-1 truncate">{item.text}</span>
            <span className="text-xs text-muted-foreground">
              {t(item.type === 'category' ? 'search.category' : 'search.product')}
            </span>
          </li>
        ))}
      </ul>
    </form>
  );
}
