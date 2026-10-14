import { pageContentSchema } from '@supershop/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_BLOCK_COMPONENTS, BlockRenderer } from '../index.js';

/** P5.3 — the catalogue of sections a shop builds pages from. */
const image = (id) => ({
  url: `/m/${id}.webp`,
  srcSet: `/m/${id}.webp 800w`,
  width: 800,
  height: 600,
});

const draw = (blocks, context = {}) =>
  render(
    <BlockRenderer
      blocks={pageContentSchema.parse({ blocks }).blocks}
      components={ALL_BLOCK_COMPONENTS}
      context={{ lang: 'en', fmtOptions: { lang: 'en', currency: 'SAR' }, ...context }}
    />,
  );

afterEach(() => vi.useRealTimers());

describe('data-backed blocks', () => {
  const data = {
    'blk-rail': {
      products: [
        { id: 'p1', href: '/product/kettle', name: 'Kettle', price: 12900, image: image('a') },
        { id: 'p2', href: '/product/mug', name: 'Mug', price: 2500, image: null },
      ],
    },
    'blk-grid': {
      categories: [{ id: 'c1', href: '/category/home', name: 'Home', image: image('b') }],
    },
    'blk-brands': {
      brands: [{ id: 'b1', href: '/search?brands=b1', name: 'Acme', logo: image('c') }],
    },
  };

  it('shows the products the page resolved, with prices in the visitor’s format', () => {
    draw([{ id: 'blk-rail', type: 'productRail', props: { heading: 'Picked for you' } }], { data });
    expect(screen.getByRole('heading', { name: 'Picked for you' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kettle/ })).toHaveAttribute('href', '/product/kettle');
    expect(screen.getByText(/129\.00/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Kettle' })).toHaveAttribute('srcset', '/m/a.webp 800w');
  });

  it('renders nothing at all when a rail has no products yet', () => {
    const { container } = draw([{ id: 'blk-rail', type: 'productRail', props: {} }], { data: {} });
    expect(container).toBeEmptyDOMElement();
  });

  it('links categories and brands where the page said', () => {
    draw(
      [
        { id: 'blk-grid', type: 'categoryGrid', props: { heading: 'Shop by category' } },
        { id: 'blk-brands', type: 'brandStrip', props: { heading: 'Brands' } },
      ],
      { data },
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/category/home');
    expect(screen.getByRole('img', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/search?brands=b1');
  });

  it('keeps internal links in the visitor’s language', () => {
    draw([{ id: 'blk-rail', type: 'productRail', props: {} }], { data, langPrefix: '/ar' });
    expect(screen.getByRole('link', { name: /Kettle/ })).toHaveAttribute(
      'href',
      '/ar/product/kettle',
    );
  });
});

describe('content blocks', () => {
  it('embeds a YouTube link privately and leaves anything else as a link', () => {
    const { unmount } = draw([
      {
        id: 'blk-v1',
        type: 'video',
        props: { url: 'https://www.youtube.com/watch?v=abc123', title: 'How it works' },
      },
    ]);
    expect(screen.getByTitle('How it works')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abc123',
    );
    unmount();

    draw([{ id: 'blk-v2', type: 'video', props: { url: 'https://example.com/clip.mp4' } }]);
    expect(screen.getByRole('link', { name: 'https://example.com/clip.mp4' })).toBeInTheDocument();
  });

  it('shows questions and answers, skipping an empty row the editor left behind', () => {
    draw([
      {
        id: 'blk-faq',
        type: 'faq',
        props: {
          heading: 'Questions',
          items: [
            { question: 'Do you deliver?', answer: 'Across the Kingdom.' },
            { question: '', answer: '' },
          ],
        },
      },
    ]);
    const rows = screen.getAllByText(/Do you deliver\?/);
    expect(rows).toHaveLength(1);
    expect(screen.getByText('Across the Kingdom.')).toBeInTheDocument();
  });

  it('draws the icon a selling point chose', () => {
    draw([
      {
        id: 'blk-f',
        type: 'features',
        props: { items: [{ title: 'Fast delivery', text: 'Two days.', icon: 'truck' }] },
      },
    ]);
    const item = screen.getByText('Fast delivery').closest('li');
    expect(item.querySelector('svg path')).toHaveAttribute(
      'd',
      expect.stringContaining('M3 7h11v8H3z'),
    );
  });

  it('writes the custom HTML the shop saved', () => {
    draw([{ id: 'blk-h', type: 'customHtml', props: { html: '<p>Store hours</p>' } }]);
    expect(screen.getByText('Store hours')).toBeInTheDocument();
  });

  it('puts nested blocks side by side in a columns block', () => {
    draw([
      {
        id: 'blk-col',
        type: 'columns',
        props: { gap: 'lg' },
        blocks: [
          { id: 'blk-a', type: 'heading', props: { text: 'Left' } },
          { id: 'blk-b', type: 'heading', props: { text: 'Right' } },
        ],
      },
    ]);
    expect(screen.getByRole('heading', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Right' })).toBeInTheDocument();
  });

  it('posts the newsletter sign-up where the page says, with a labelled field', () => {
    draw(
      [
        {
          id: 'blk-n',
          type: 'newsletter',
          props: { heading: 'Stay in touch', buttonLabel: 'Sign up' },
        },
      ],
      {
        newsletterAction: '/subscribe',
        emailLabel: 'Email address',
      },
    );
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('button', { name: 'Sign up' }).closest('form')).toHaveAttribute(
      'action',
      '/subscribe',
    );
  });
});

describe('hero carousel', () => {
  const slides = [
    {
      mediaId: '507f1f77bcf86cd799439011',
      heading: 'First',
      text: '',
      buttonLabel: 'Shop',
      href: '/search',
    },
    { mediaId: '507f1f77bcf86cd799439012', heading: 'Second', text: '', buttonLabel: '', href: '' },
  ];
  const media = {
    '507f1f77bcf86cd799439011': image('h1'),
    '507f1f77bcf86cd799439012': image('h2'),
  };

  it('moves to the next slide when asked', async () => {
    const user = userEvent.setup();
    draw([{ id: 'blk-hero', type: 'heroCarousel', props: { slides, autoplaySeconds: 0 } }], {
      media,
      labels: { previous: 'Previous slide', next: 'Next slide', slide: 'Slide' },
    });
    expect(screen.getByRole('heading', { name: 'First' }).closest('div').parentElement).toHaveClass(
      'relative',
    );
    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByRole('button', { name: 'Slide 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('advances by itself only when the admin asked for it', () => {
    vi.useFakeTimers();
    draw([{ id: 'blk-hero', type: 'heroCarousel', props: { slides, autoplaySeconds: 5 } }], {
      media,
      labels: { slide: 'Slide' },
    });
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByRole('button', { name: 'Slide 2' })).toHaveAttribute('aria-current', 'true');
  });
});

describe('countdown', () => {
  it('counts down to the end of the offer and drops the button once it has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    draw(
      [
        {
          id: 'blk-c',
          type: 'countdown',
          props: {
            heading: 'Offer ends soon',
            endsAt: '2026-01-01T00:00:30.000Z',
            buttonLabel: 'Shop the offer',
            href: '/search',
          },
        },
      ],
      { labels: { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' } },
    );

    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop the offer' })).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(31_000));
    expect(screen.queryByRole('link', { name: 'Shop the offer' })).not.toBeInTheDocument();
    expect(screen.queryByText('Seconds')).not.toBeInTheDocument();
  });
});
