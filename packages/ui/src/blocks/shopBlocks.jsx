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
  <section className={cn('grid gap-4', className)}>
    {heading ? <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2> : null}
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
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
        {products.map((product) => (
          <li key={product.id} className="w-44 shrink-0 snap-start sm:w-52">
            <a href={hrefIn(product.href, context)} className="grid gap-2">
              <span className="block aspect-square overflow-hidden rounded-xl bg-muted">
                {product.image ? (
                  <img
                    src={product.image.url}
                    srcSet={product.image.srcSet ?? undefined}
                    sizes="(min-width: 640px) 208px, 176px"
                    alt={product.name}
                    width={product.image.width}
                    height={product.image.height}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
              </span>
              <span className="line-clamp-2 text-sm">{product.name}</span>
              <span className="text-sm font-semibold">
                <Money amount={product.price} context={context} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function CategoryGridBlock({ id, heading, columns = '3', context = {} }) {
  const categories = context.data?.[id]?.categories ?? [];
  if (!categories.length) return null;
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[
    columns
  ];
  return (
    <Section heading={heading}>
      <ul className={cn('grid grid-cols-2 gap-3', cols)}>
        {categories.map((category) => (
          <li key={category.id}>
            <a
              href={hrefIn(category.href, context)}
              className="relative grid aspect-[4/3] place-items-end overflow-hidden rounded-xl bg-muted p-3"
            >
              {category.image ? (
                <img
                  src={category.image.url}
                  srcSet={category.image.srcSet ?? undefined}
                  sizes="(min-width: 640px) 33vw, 50vw"
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : null}
              <span className="relative rounded-full bg-background/90 px-3 py-1 text-sm font-medium">
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
        'relative grid min-h-56 items-center overflow-hidden rounded-2xl p-8',
        tone === 'dark' ? 'bg-foreground text-background' : 'bg-muted',
      )}
    >
      {image ? (
        <img
          src={image.url}
          srcSet={image.srcSet ?? undefined}
          sizes="100vw"
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover opacity-60"
        />
      ) : null}
      <div className="relative grid max-w-xl gap-3">
        {heading ? <h2 className="text-2xl font-semibold sm:text-3xl">{heading}</h2> : null}
        {text ? <p className="text-base/7">{text}</p> : null}
        {buttonLabel ? (
          <a
            href={hrefIn(href, context)}
            className="inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            {buttonLabel}
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
        {items.map((item) => (
          <li key={item.title} className="grid gap-1 rounded-xl border p-5">
            <FeatureIcon name={item.icon} />
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
    <section className="grid gap-3 rounded-2xl bg-muted p-8">
      {heading ? <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2> : null}
      {text ? <p className="text-base/7 text-muted-foreground">{text}</p> : null}
      <form
        method="post"
        action={context.newsletterAction ?? '/api/v1/newsletter'}
        className="flex max-w-md flex-wrap gap-2"
      >
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-label={context.emailLabel ?? 'Email address'}
          placeholder={context.emailLabel ?? 'Email address'}
          className="h-11 min-w-0 flex-1 rounded-full border px-4 text-sm"
        />
        <button
          type="submit"
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          {buttonLabel}
        </button>
      </form>
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
