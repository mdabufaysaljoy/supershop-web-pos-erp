import Link from 'next/link';
import { MediaImage } from '@/components/catalog/MediaImage';
import { localizePath } from '@/i18n/config';
import { categoryPath } from '@/lib/categories';

/**
 * Visual Multi-Category Grid for a modern non-food supershop:
 * - Electronics, Mobile Accessories, Audio, Fashion, Smart Living
 * - Hover lift, smooth image zoom, category pill badge
 */
export function CategoryShowcase({ categories = [], lang, t }) {
  // If the store has seeded categories, use them; otherwise show curated supershop departments
  const items =
    categories.length > 0
      ? categories
      : [
          {
            id: 'cat-mobiles',
            name: 'Mobiles & Accessories',
            slug: 'mobiles-accessories',
            icon: '📱',
            tag: 'Fast Chargers & Cases',
          },
          {
            id: 'cat-audio',
            name: 'Audio & Wearables',
            slug: 'audio-wearables',
            icon: '🎧',
            tag: 'Earbuds & Watches',
          },
          {
            id: 'cat-computing',
            name: 'Computing & Gaming',
            slug: 'computing-gaming',
            icon: '💻',
            tag: 'Gear & Displays',
          },
          {
            id: 'cat-fashion',
            name: 'Fashion & Apparel',
            slug: 'fashion-apparel',
            icon: '👕',
            tag: 'Streetwear & Watches',
          },
          {
            id: 'cat-home',
            name: 'Smart Home Living',
            slug: 'smart-home',
            icon: '🏠',
            tag: 'Robotics & Purifiers',
          },
          {
            id: 'cat-power',
            name: 'Power & Cables',
            slug: 'power-cables',
            icon: '🔋',
            tag: 'GaN Chargers & Banks',
          },
        ];

  return (
    <section className="grid gap-6" aria-labelledby="home-categories">
      <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Curated Departments
          </span>
          <h2
            id="home-categories"
            className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            {t('home.categories')}
          </h2>
        </div>
        <Link
          href={localizePath('/search', lang)}
          className="group inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <span>{t('home.viewAll')}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 rtl:-scale-x-100 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((c) => (
          <li key={c.id}>
            <Link
              href={localizePath(categoryPath(c.slug), lang)}
              className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-border/80 bg-card p-4 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg"
            >
              <div className="relative aspect-square overflow-hidden rounded-md bg-gradient-to-br from-muted/60 to-muted/20">
                {c.image ? (
                  <MediaImage
                    image={c.image}
                    alt={c.name}
                    sizes="(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 46vw"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-4xl transition-transform duration-300 group-hover:scale-110">
                    {c.icon || '🛍️'}
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-0.5 text-start">
                <span className="text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                  {c.name}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {c.tag || 'Explore Products'}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
