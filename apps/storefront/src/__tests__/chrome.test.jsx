// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { translator } from '@/i18n/dictionaries';
import en from '@/i18n/dictionaries/en.json';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteNav } from '@/components/layout/SiteNav';

/** P5.4/P5.5 — the chrome the shop arranges: announcement bar, navigation, footer, logo. */
// The header's own buttons are client components with their own providers; this is about the
// header's structure, so they stand in as markers.
vi.mock('@/components/search/SearchBox', () => ({ SearchBox: () => <div /> }));
vi.mock('@/components/account/AccountButton', () => ({ AccountButton: () => <div /> }));
vi.mock('@/components/cart/CartButton', () => ({ CartButton: () => <div /> }));
vi.mock('@/components/layout/LanguageSwitcher', () => ({ LanguageSwitcher: () => <div /> }));
const { SiteHeader } = await import('@/components/layout/SiteHeader');
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

describe('how to reach the shop', () => {
  const contact = {
    phone: '+966501234567',
    whatsapp: '+966501234567',
    email: 'hello@shop.test',
    address: 'King Fahd Road, Riyadh',
  };

  it('shows the details the shop entered, each one actionable', () => {
    render(
      <SiteFooter
        lang="en"
        storeName="Supershop"
        footer={{}}
        contact={contact}
        social={[{ platform: 'instagram', url: 'https://instagram.com/shop' }]}
        t={t}
        fmt={fmt}
      />,
    );
    expect(screen.getByRole('link', { name: '+966501234567' })).toHaveAttribute(
      'href',
      'tel:+966501234567',
    );
    expect(screen.getByRole('link', { name: 'hello@shop.test' })).toHaveAttribute(
      'href',
      'mailto:hello@shop.test',
    );
    expect(screen.getByRole('link', { name: en.footer.whatsapp })).toHaveAttribute(
      'href',
      'https://wa.me/966501234567',
    );
    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/shop',
    );
    expect(screen.getByText('King Fahd Road, Riyadh')).toBeInTheDocument();
  });

  it('says nothing about contact when the shop has filled nothing in', () => {
    render(<SiteFooter lang="en" storeName="Supershop" footer={{}} t={t} fmt={fmt} />);
    expect(screen.queryByText(en.footer.contact)).toBeNull();
  });
});

describe('the header', () => {
  it('shows the shop’s logo when it has one, and its name when it does not', () => {
    const { unmount } = render(
      <SiteHeader
        lang="en"
        storeName="Supershop"
        logo={{ url: '/m/logo.webp', width: 200, height: 60 }}
        header={{ menu: [] }}
        t={t}
      />,
    );
    expect(screen.getByRole('img', { name: 'Supershop' })).toHaveAttribute('src', '/m/logo.webp');
    unmount();

    render(<SiteHeader lang="en" storeName="Supershop" header={{ menu: [] }} t={t} />);
    expect(screen.getByRole('link', { name: 'Supershop' })).toHaveTextContent('Supershop');
  });

  it('honors logoDisplay options: both, logo only, or name only', () => {
    const logo = { url: '/m/logo.webp', width: 200, height: 60 };

    // 1. Both logo and name
    const { unmount: u1 } = render(
      <SiteHeader
        lang="en"
        storeName="Supershop"
        logo={logo}
        logoDisplay="both"
        header={{ menu: [] }}
        t={t}
      />,
    );
    expect(screen.getByRole('img', { name: 'Supershop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Supershop' })).toHaveTextContent('Supershop');
    u1();

    // 2. Only logo
    const { unmount: u2 } = render(
      <SiteHeader
        lang="en"
        storeName="Supershop"
        logo={logo}
        logoDisplay="logo"
        header={{ menu: [] }}
        t={t}
      />,
    );
    expect(screen.getByRole('img', { name: 'Supershop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Supershop' })).not.toHaveTextContent('Supershop');
    u2();

    // 3. Only name (even if logo is provided)
    const { unmount: u3 } = render(
      <SiteHeader
        lang="en"
        storeName="Supershop"
        logo={logo}
        logoDisplay="name"
        header={{ menu: [] }}
        t={t}
      />,
    );
    expect(screen.queryByRole('img', { name: 'Supershop' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Supershop' })).toHaveTextContent('Supershop');
    u3();
  });
});
