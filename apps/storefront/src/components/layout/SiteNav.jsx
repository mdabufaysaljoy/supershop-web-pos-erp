import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * The header's navigation row: either the menu the shop arranged (P5.4) or its top-level
 * categories. An item with children opens a panel on hover AND on focus — no JavaScript, so the
 * header stays server-rendered, and keyboard users reach every link by tabbing.
 */
const linkHref = (href, lang) => (href?.startsWith('/') ? localizePath(href, lang) : href);

const top =
  'inline-block border-b-2 border-transparent py-2.5 hover:border-foreground hover:text-foreground';

export function SiteNav({ items = [], lang, label }) {
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="mx-auto max-w-7xl px-4">
      <ul className="-mb-px flex gap-5 text-sm whitespace-nowrap">
        {items.map((item) =>
          item.children?.length ? (
            <li key={item.id} className="group relative">
              <Link
                href={linkHref(item.href ?? '#', lang)}
                className={`${top} font-medium`}
                aria-haspopup="true"
              >
                {item.label}
              </Link>
              <div className="invisible absolute start-0 top-full z-20 min-w-56 rounded-xl border bg-background p-3 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <ul className="grid gap-1">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={linkHref(child.href, lang)}
                        className="block rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ) : (
            <li key={item.id}>
              <Link href={linkHref(item.href, lang)} className={`${top} font-medium`}>
                {item.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
