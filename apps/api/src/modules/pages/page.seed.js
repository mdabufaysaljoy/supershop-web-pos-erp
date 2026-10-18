import { SOURCE_LANGUAGE, pageContentSchema, syncTexts } from '@supershop/shared';
import * as repo from './page.repo.js';

/**
 * The home page a fresh shop starts with (P5.6): hero → categories → new arrivals → best sellers
 * → why shop with us → offer banner → newsletter.
 *
 * It is ORDINARY page content, not a special case: every block is one the catalogue already
 * defines (P5.3), so the shop opens the builder and rearranges, rewords or deletes any of it. The
 * data-backed blocks ask for categories and products by rule, so the page fills itself in as the
 * catalogue grows — a shop with no products yet simply shows fewer sections.
 *
 * English only, like everything staff-facing and customer-facing we author; Arabic is generated
 * by the normal pipeline because the text goes through `syncTexts` (§5.7).
 */
export const HOME_TEMPLATE = Object.freeze({
  blocks: [
    {
      id: 'home-hero',
      type: 'heroCarousel',
      props: {
        slides: [
          {
            mediaId: null,
            heading: 'Mega Supershop — Electronics, Tech & Essentials',
            text: 'Discover top flagship electronics, audio gear, and cutting-edge devices across Saudi Arabia.',
            buttonLabel: 'Explore Electronics',
            href: '/search?q=electronics',
          },
          {
            mediaId: null,
            heading: 'Trending Fashion, Streetwear & Modern Living',
            text: 'Curated seasonal styles, premium apparel, footwear and accessories for everyday comfort.',
            buttonLabel: 'Shop Fashion',
            href: '/search?q=fashion',
          },
          {
            mediaId: null,
            heading: 'Super Deals of the Week — Up to 50% Off',
            text: 'Unbeatable limited-time savings on top-rated products with fast Saudi dispatch.',
            buttonLabel: 'Grab Deals Now',
            href: '/search?sort=price_asc',
          },
        ],
        autoplaySeconds: 5,
      },
    },
    {
      id: 'home-categories',
      type: 'categoryGrid',
      props: { heading: 'Shop by category', categoryIds: [], columns: '3' },
    },
    {
      id: 'home-newest',
      type: 'productRail',
      props: { heading: 'New arrivals', source: 'newest', limit: 8 },
    },
    {
      id: 'home-best',
      type: 'productRail',
      props: { heading: 'Best sellers', source: 'bestSelling', limit: 8 },
    },
    {
      id: 'home-features',
      type: 'features',
      props: {
        heading: 'Why shop with us',
        items: [
          {
            title: 'Delivery across the Kingdom',
            text: 'Dispatched within one working day.',
            icon: 'truck',
          },
          { title: 'Easy returns', text: 'Change your mind within 14 days.', icon: 'refresh' },
          {
            title: 'Here to help',
            text: 'Call or message us any day of the week.',
            icon: 'headset',
          },
        ],
      },
    },
    {
      id: 'home-banner',
      type: 'banner',
      props: {
        mediaId: null,
        heading: 'This week’s offers',
        text: 'Prices you will want to tell someone about.',
        buttonLabel: 'See the offers',
        href: '/search?sort=newest',
        tone: 'dark',
      },
    },
    {
      id: 'home-newsletter',
      type: 'newsletter',
      props: {
        heading: 'Subscribe for new offer updates',
        text: 'Get exclusive deals, flash discounts, and new arrivals delivered straight to your inbox.',
        buttonLabel: 'Subscribe',
      },
    },
  ],
});

/**
 * Creates the starting home page, PUBLISHED, if the shop has none. Never touches an existing one:
 * a shop that has arranged (or deleted) its home page keeps what it decided, on every deploy.
 * @returns {Promise<null | { slug: string, blocks: number }>} what was created, or null
 */
export async function seedHomePage() {
  if (await repo.findHome()) return null;
  const slug = (await repo.slugExists('home')) ? `home-${Date.now().toString(36)}` : 'home';
  const content = pageContentSchema.parse(structuredClone(HOME_TEMPLATE));
  const created = await repo.create({
    slug,
    title: { [SOURCE_LANGUAGE]: 'Home' },
    status: 'published',
    isHome: true,
    draft: content,
    published: structuredClone(content),
    texts: syncTexts(content, []),
    publishedAt: new Date(),
    seo: {
      title: { [SOURCE_LANGUAGE]: '' },
      description: { [SOURCE_LANGUAGE]: '' },
    },
  });
  return { slug: created.slug, blocks: created.draft.blocks.length };
}
