import { cn } from '../lib/cn.js';
import { SHOP_BLOCK_COMPONENTS } from './shopBlocks.jsx';

/**
 * Renderers for the blocks the registry defines in P5.1. They are plain, themeable and work in
 * both directions (logical CSS only), because the same markup serves the storefront and the
 * admin preview. P5.3 adds the rest of the catalogue beside them.
 *
 * `context` carries what a block cannot know by itself (image URLs, link helper, the language).
 */
export function HeadingBlock({ text, level = 'h2', align = 'start' }) {
  const Tag = level;
  const size = { h1: 'text-3xl sm:text-4xl', h2: 'text-2xl sm:text-3xl', h3: 'text-xl' }[level];
  return (
    <Tag className={cn('font-semibold tracking-tight', size, align === 'center' && 'text-center')}>
      {text}
    </Tag>
  );
}

/**
 * Rich text. The HTML was sanitized when it was SAVED (server-side, §5.1); rendering it here
 * without sanitizing again is safe only because nothing else can write this field.
 */
export function RichTextBlock({ html }) {
  return (
    <div
      className="prose max-w-none text-base/7 [&_a]:underline [&_a]:underline-offset-4"
      // eslint-disable-next-line react/no-danger -- sanitized server-side on save (core/sanitizeHtml)
      dangerouslySetInnerHTML={{ __html: html ?? '' }}
    />
  );
}

export function ImageBlock({ mediaId, alt, href, width = 'contained', context = {} }) {
  const image = context.media?.[mediaId];
  if (!image) return null;
  const img = (
    <img
      src={image.url}
      srcSet={image.srcSet}
      sizes={width === 'full' ? '100vw' : '(min-width: 1024px) 1024px, 100vw'}
      alt={alt ?? ''}
      width={image.width}
      height={image.height}
      loading="lazy"
      className={cn(
        'h-auto w-full rounded-xl object-cover',
        width === 'contained' && 'mx-auto max-w-5xl',
      )}
    />
  );
  return href ? (
    <a href={context.localizeHref?.(href) ?? href} className="block">
      {img}
    </a>
  ) : (
    img
  );
}

export function SpacerBlock({ size = 'md' }) {
  return <div aria-hidden="true" className={{ sm: 'h-4', md: 'h-10', lg: 'h-20' }[size]} />;
}

export function ButtonLinkBlock({ label, href, variant = 'primary', context = {} }) {
  return (
    <a
      href={context.localizeHref?.(href) ?? href}
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium',
        variant === 'primary' ? 'bg-primary text-primary-foreground' : 'border',
      )}
    >
      {label}
    </a>
  );
}

/** type → component, ready to hand to `BlockRenderer`. */
export const CORE_BLOCK_COMPONENTS = Object.freeze({
  heading: HeadingBlock,
  richText: RichTextBlock,
  image: ImageBlock,
  spacer: SpacerBlock,
  buttonLink: ButtonLinkBlock,
});

/** Every block the registry knows, for the storefront and the admin preview alike. */
export const ALL_BLOCK_COMPONENTS = Object.freeze({
  ...CORE_BLOCK_COMPONENTS,
  ...SHOP_BLOCK_COMPONENTS,
});
