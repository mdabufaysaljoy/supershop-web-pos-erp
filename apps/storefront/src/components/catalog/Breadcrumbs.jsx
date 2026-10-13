import Link from 'next/link';
import { localizePath } from '@/i18n/config';

/**
 * Breadcrumb trail; the last item is the current page. The `›` separator is a Unicode
 * bidi-mirrored character, so browsers already draw it as `‹` in RTL (don't flip it with CSS).
 */
export function Breadcrumbs({ items, lang, label }) {
  return (
    <nav aria-label={label} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link href={localizePath(item.path, lang)} className="hover:text-foreground">
                    {item.name}
                  </Link>
                  <span aria-hidden>›</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
