// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { translator } from '@/i18n/dictionaries';
import en from '@/i18n/dictionaries/en.json';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteNav } from '@/components/layout/SiteNav';

/** P5.4 — the chrome the shop arranges: announcement bar, navigation, footer menus. */
const t = translator(en);
const fmt = { plain: (n) => String(n) };

describe('announcement bar', () => {
  it('says nothing when the shop switched it off or wrote nothing', () => {
    const { container, unmount } = render(
      <AnnouncementBar announcement={{ enabled: false, text: 'Hi' }} lang="en" />,
    );
    expect(container).toBeEmptyDOMElement();
    unmount();
    const second = render(<AnnouncementBar announcement={{ enabled: true, text: '' }} lang="en" />);
    expect(second.container).toBeEmptyDOMElement();
  });

  it('links to where the shop pointed it, in the visitor’s language', () => {
    render(
      <AnnouncementBar
        announcement={{ enabled: true, text: 'Free delivery', href: '/search', tone: 'dark' }}
        lang="ar"
      />,
    );
    expect(screen.getByRole('link', { name: 'Free delivery' })).toHaveAttribute(
      'href',
      '/ar/search',
    );
  });
});

describe('the navigation', () => {
  const items = [
    { id: 'all', label: 'All products', href: '/search', children: [] },
    {
      id: 'shop',
      label: 'Shop',
      href: '/search',
      children: [{ id: 'kettles', label: 'Kettles', href: '/category/kettles', children: [] }],
    },
  ];

  it('renders the shop’s own menu, keeping internal links in the language', () => {
    render(<SiteNav items={items} lang="ar" label="Main" />);
    expect(screen.getByRole('link', { name: 'All products' })).toHaveAttribute(
      'href',
      '/ar/search',
    );
    expect(screen.getByRole('link', { name: 'Kettles' })).toHaveAttribute(
      'href',
      '/ar/category/kettles',
    );
  });

  it('marks a parent as opening a panel, and renders nothing without items', () => {
    const { unmount } = render(<SiteNav items={items} lang="en" label="Main" />);
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('aria-haspopup', 'true');
    unmount();
    const { container } = render(<SiteNav items={[]} lang="en" label="Main" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the footer', () => {
  it('shows the shop’s menus and note beside the lines it does not write', () => {
    render(
      <SiteFooter
        lang="en"
        storeName="Supershop"
        pricesIncludeVat
        footer={{
          note: 'Riyadh, Saudi Arabia',
          menus: [
            {
              id: 'm1',
              title: 'Help',
              items: [{ id: 'a', label: 'Track your order', href: '/track', children: [] }],
            },
          ],
        }}
        t={t}
        fmt={fmt}
      />,
    );
    const help = within(screen.getByRole('navigation', { name: 'Help' }));
    expect(help.getByRole('link', { name: 'Track your order' })).toHaveAttribute('href', '/track');
    expect(screen.getByText('Riyadh, Saudi Arabia')).toBeInTheDocument();
    expect(screen.getByText(en.footer.vatIncluded)).toBeInTheDocument();
  });

  it('keeps order tracking reachable before the shop has made any menu', () => {
    render(<SiteFooter lang="en" storeName="Supershop" footer={{}} t={t} fmt={fmt} />);
    expect(screen.getByRole('link', { name: en.track.linkLabel })).toBeInTheDocument();
  });
});
