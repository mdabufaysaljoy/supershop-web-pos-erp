import { cn } from '../lib/cn.js';
import { hrefIn, money } from './context.js';
import { CountdownBlock } from './CountdownBlock.jsx';
import { HeroCarouselBlock } from './HeroCarouselBlock.jsx';

/**
 * The sections a shop builds pages from (P5.3). They are plain, themeable and work in both
 * directions (logical CSS only), and they never fetch anything: whatever a block needs — images,
 * products, categories, brands — arrives already resolved in `context`, put there by the page API.
 * The two that must move (carousel, countdown) live in their own client files.
 */
const Section = ({ heading, children, className }) => (
  <section className={cn('grid gap-6', className)}>
    {heading ? (
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{heading}</h2>
      </div>
    ) : null}
    {children}
  </section>
);

const Money = ({ amount, context }) => money(amount, context);

// ---------------------------------------------------------------- shopping

export function ProductRailBlock({ id, heading, context = {} }) {
  const products = context.data?.[id]?.products ?? [];
  if (!products.length) return null;
  return (
    <Section heading={heading}>
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 hide-scrollbar">
        {products.map((product) => (
          <li key={product.id} className="w-56 shrink-0 snap-start sm:w-64">
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-xl">
              <div>
                <span className="relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-2 pointer-events-none">
                  {product.image ? (
                    <img
                      src={product.image.url}
                      srcSet={product.image.srcSet ?? undefined}
                      sizes="(min-width: 640px) 256px, 224px"
                      alt={product.name}
                      width={product.image.width}
                      height={product.image.height}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="text-3xl text-muted-foreground/30">📦</span>
                  )}
                  <span className="absolute start-2.5 top-2.5 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-xs">
                    In Stock
                  </span>
                </span>
                <div className="space-y-1">
                  <span className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    <a
                      href={hrefIn(product.href, context)}
                      className="after:absolute after:inset-0 after:content-['']"
                    >
                      {product.name}
                    </a>
                  </span>
                  <div className="flex items-baseline gap-1 text-base font-bold text-foreground">
                    <Money amount={product.price} context={context} />
                  </div>
                </div>
              </div>
              <div className="relative z-10 mt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof context.onAddToCart === 'function') {
                      context.onAddToCart(product);
                    }
                  }}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 text-xs font-semibold text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="size-3.5"
                    aria-hidden="true"
                  >
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                    <path d="M3 6h18" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                  <span>Add to Cart</span>
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CategoryGridBlock({ id, heading, columns = '3', context = {} }) {
  const categories = context.data?.[id]?.categories ?? [];
  const displayCategories =
    categories.length > 0
      ? categories
      : [
          {
            id: 'cat-mobiles',
            name: 'Smartphones & Accessories',
            href: '/search?q=mobile',
            emoji: '📱',
          },
          {
            id: 'cat-audio',
            name: 'Audio & Wireless Gadgets',
            href: '/search?q=audio',
            emoji: '🎧',
          },
          {
            id: 'cat-computing',
            name: 'Laptops & Tech Gear',
            href: '/search?q=laptop',
            emoji: '💻',
          },
          {
            id: 'cat-fashion',
            name: 'Modern Fashion & Apparel',
            href: '/search?q=clothing',
            emoji: '👕',
          },
          {
            id: 'cat-smarthome',
            name: 'Smart Home & Appliances',
            href: '/search?q=home',
            emoji: '🏠',
          },
          { id: 'cat-power', name: 'Chargers & Power Banks', href: '/search?q=power', emoji: '⚡' },
        ];

  const cols =
    { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns] ||
    'sm:grid-cols-3';

  return (
    <Section heading={heading}>
      <ul className={cn('grid grid-cols-2 gap-3 sm:gap-4', cols)}>
        {displayCategories.map((category) => (
          <li key={category.id}>
            <a
              href={hrefIn(category.href, context)}
              className="group relative grid aspect-[4/3] place-items-end overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-muted/50 to-muted p-4 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
            >
              {category.image ? (
                <img
                  src={category.image.url}
                  srcSet={category.image.srcSet ?? undefined}
                  sizes="(min-width: 640px) 33vw, 50vw"
                  alt=""
                  width={category.image.width}
                  height={category.image.height}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-4xl sm:text-5xl opacity-80 group-hover:scale-110 transition-transform duration-300"
                    aria-hidden="true"
                  >
                    {category.emoji || '🛍️'}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />
              <span className="relative rounded-xl bg-background/95 px-3 py-1.5 text-xs sm:text-sm font-bold text-foreground shadow-sm backdrop-blur-md group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                {category.name}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function BrandStripBlock({ id, heading, context = {} }) {
  const brands = context.data?.[id]?.brands ?? [];
  if (!brands.length) return null;
  return (
    <Section heading={heading}>
      <ul className="flex flex-wrap items-center gap-6">
        {brands.map((brand) => (
          <li key={brand.id}>
            <a href={hrefIn(brand.href, context)} className="block">
              {brand.logo ? (
                <img
                  src={brand.logo.url}
                  alt={brand.name}
                  height={40}
                  loading="lazy"
                  className="h-10 w-auto opacity-80 transition-opacity hover:opacity-100"
                />
              ) : (
                <span className="text-sm text-muted-foreground">{brand.name}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- content

export function BannerBlock({
  mediaId,
  heading,
  text,
  buttonLabel,
  href,
  tone = 'dark',
  context = {},
}) {
  const image = context.media?.[mediaId];
  return (
    <section
      className={cn(
        'relative grid min-h-64 items-center overflow-hidden rounded-3xl p-8 sm:p-12 shadow-2xl border border-border/50',
        tone === 'dark'
          ? 'bg-linear-to-r from-slate-950 via-indigo-950 to-slate-900 text-white'
          : 'bg-linear-to-r from-primary/10 via-background to-accent/10 text-foreground',
      )}
    >
      <div className="absolute -end-20 -top-20 size-80 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      {image ? (
        <img
          src={image.url}
          srcSet={image.srcSet ?? undefined}
          sizes="100vw"
          alt={heading || image.alt || ''}
          width={image.width}
          height={image.height}
          loading="lazy"
          className="absolute inset-0 size-full object-cover opacity-25 mix-blend-overlay"
        />
      ) : null}
      <div className="relative grid max-w-xl gap-3 sm:gap-4">
        <span className="w-fit rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-400 backdrop-blur-xs">
          Exclusive Member Deals
        </span>
        {heading ? (
          <h2 className="text-2xl font-extrabold sm:text-4xl tracking-tight leading-tight">
            {heading}
          </h2>
        ) : null}
        {text ? (
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{text}</p>
        ) : null}
        {buttonLabel ? (
          <a
            href={hrefIn(href, context)}
            className="group inline-flex h-12 w-fit items-center gap-2 rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-105 hover:bg-primary/90"
          >
            <span>{buttonLabel}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="size-4 rtl:-scale-x-100 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        ) : null}
      </div>
    </section>
  );
}

/** Only YouTube and Vimeo are embedded; anything else is shown as a plain link. */
const embedUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (/(^|\.)youtube\.com$/.test(parsed.hostname)) {
      const id = parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop();
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (parsed.hostname === 'youtu.be')
      return `https://www.youtube-nocookie.com/embed${parsed.pathname}`;
    if (/(^|\.)vimeo\.com$/.test(parsed.hostname))
      return `https://player.vimeo.com/video/${parsed.pathname.split('/').pop()}`;
    return null;
  } catch {
    return null;
  }
};

export function VideoBlock({ url, title }) {
  const embed = embedUrl(url);
  if (!embed)
    return url ? (
      <a href={url} className="underline underline-offset-4">
        {title || url}
      </a>
    ) : null;
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-muted">
      <iframe
        src={embed}
        title={title || 'Video'}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="size-full"
      />
    </div>
  );
}

export function FaqBlock({ heading, items = [] }) {
  const questions = items.filter((item) => item.question);
  if (!questions.length) return null;
  return (
    <Section heading={heading}>
      <dl className="grid gap-2">
        {questions.map((item) => (
          <details key={item.question} className="rounded-xl border p-4">
            <summary className="cursor-pointer font-medium">{item.question}</summary>
            <dd className="mt-2 text-base/7 text-muted-foreground">{item.answer}</dd>
          </details>
        ))}
      </dl>
    </Section>
  );
}

/** The five icons a selling point may use (shared/FEATURE_ICONS), drawn inline — no icon font. */
const FEATURE_PATHS = {
  truck: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 17.5a1.5 1.5 0 1 0 0 .01M17 17.5a1.5 1.5 0 1 0 0 .01',
  shield: 'M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  headset: 'M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1zM20 13h-3v5h2a1 1 0 0 0 1-1z',
  offers: 'M3 12l9-9 9 9-9 9zM8.5 8.5h.01',
};

const FeatureIcon = ({ name }) =>
  FEATURE_PATHS[name] ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6 text-primary"
    >
      <path d={FEATURE_PATHS[name]} />
    </svg>
  ) : null;

export function FeaturesBlock({ heading, items = [] }) {
  if (!items.length) return null;
  return (
    <Section heading={heading}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li
            key={item.id ?? `${item.title}-${index}`}
            className="group flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xs backdrop-blur-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
              <FeatureIcon name={item.icon} />
            </div>
            <span className="text-sm font-semibold">{item.title}</span>
            <span className="text-sm text-muted-foreground">{item.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function TestimonialsBlock({ heading, items = [] }) {
  const quotes = items.filter((item) => item.quote);
  if (!quotes.length) return null;
  return (
    <Section heading={heading}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quotes.map((item) => (
          <li key={item.quote} className="grid gap-2 rounded-xl border p-5">
            <blockquote className="text-base/7">“{item.quote}”</blockquote>
            {item.author ? (
              <cite className="text-sm text-muted-foreground not-italic">{item.author}</cite>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Newsletter sign-up. The form posts to the storefront route the page gives it, so this component
 * stays dumb and the campaign module (P7.3) owns what happens next.
 */
export function NewsletterBlock({ heading, text, buttonLabel, context = {} }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-muted/40 to-card p-8 sm:p-12 shadow-xl">
      <div className="absolute -start-24 -bottom-24 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative max-w-2xl space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <span>✨</span> VIP Club
        </span>
        {heading ? (
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {heading}
          </h2>
        ) : null}
        {text ? (
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{text}</p>
        ) : null}
        <form
          method="post"
          action={context.newsletterAction ?? '/api/v1/newsletter'}
          className="flex max-w-md flex-wrap sm:flex-nowrap gap-2.5 pt-2"
        >
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            aria-label={context.emailLabel ?? 'Email address'}
            placeholder={context.emailLabel ?? 'Email address'}
            className="h-12 min-w-0 flex-1 rounded-full border border-input bg-background px-5 text-sm shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            className="h-12 rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-300 hover:scale-105 hover:bg-primary/90 cursor-pointer"
          >
            {buttonLabel}
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
          <span>✓ Instant 10% Off coupon</span>
          <span>✓ Early access to flash sales</span>
          <span>✓ Unsubscribe anytime</span>
        </div>
      </div>
    </section>
  );
}

/** Staff-written HTML, sanitized server-side when it was saved (§5.1). */
export function CustomHtmlBlock({ html }) {
  return (
    <div
      // eslint-disable-next-line react/no-danger -- sanitized on save (api core/sanitizeHtml)
      dangerouslySetInnerHTML={{ __html: html ?? '' }}
    />
  );
}

/** A container: whatever blocks were nested inside it, side by side. */
export function ColumnsBlock({ gap = 'md', children }) {
  const gaps = { sm: 'gap-2', md: 'gap-4', lg: 'gap-8' };
  return <div className={cn('grid sm:grid-cols-2', gaps[gap])}>{children}</div>;
}

/** type → component for everything P5.3 added, merged with the core five by `ALL_BLOCK_COMPONENTS`. */
export const SHOP_BLOCK_COMPONENTS = Object.freeze({
  heroCarousel: HeroCarouselBlock,
  categoryGrid: CategoryGridBlock,
  productRail: ProductRailBlock,
  banner: BannerBlock,
  video: VideoBlock,
  faq: FaqBlock,
  features: FeaturesBlock,
  testimonials: TestimonialsBlock,
  countdown: CountdownBlock,
  brandStrip: BrandStripBlock,
  newsletter: NewsletterBlock,
  customHtml: CustomHtmlBlock,
  columns: ColumnsBlock,
});
