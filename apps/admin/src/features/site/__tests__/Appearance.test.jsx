import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { AppearancePage } from '../pages/AppearancePage';
import { MenuEditorPage } from '../pages/MenuEditorPage';

/** P5.4 — the shop arranges its own announcement bar, menus and colours. */
const MENUS = [
  {
    id: 'm1',
    title: 'Main menu',
    slug: 'main-menu',
    location: 'header',
    items: [
      { id: 'all', label: 'All products', target: 'products', ref: null, href: '', children: [] },
    ],
    texts: [{ key: 'all', value: { en: 'All products', ar: 'كل المنتجات' } }],
    updatedAt: '2026-10-14T08:00:00.000Z',
  },
];
const LAYOUT = {
  headerMenuId: null,
  showCategoryRow: true,
  announcement: { enabled: false, text: { en: '' }, href: '', tone: 'primary' },
  footer: { note: { en: '' }, menuIds: [] },
  theme: { primary: '#1f1f1f', primaryForeground: '#fafafa', radius: 'md', font: 'bundled' },
  updatedAt: '2026-10-14T08:00:00.000Z',
};

const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);

function setup({
  permissions = ['page.view', 'menu.manage'],
  routes = {},
  path = '/appearance',
} = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/site/menus': json(200, { data: MENUS }),
    'GET /api/v1/site/layout': json(200, { data: LAYOUT }),
    'GET /api/v1/site/menus/m1': json(200, { data: MENUS[0] }),
    'GET /api/v1/pages': json(200, {
      data: [{ id: 'pg1', title: { en: 'About us' }, slug: 'about-us' }],
    }),
    'GET /api/v1/categories': json(200, {
      data: [
        { id: 'c1', name: { en: 'Home' }, slug: 'home', parentId: null, depth: 0, position: 0 },
      ],
    }),
    'GET /api/v1/brands': json(200, { data: [{ id: 'b1', name: 'Acme', slug: 'acme' }] }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/appearance" element={<AppearancePage />} />
          <Route path="/appearance/:id" element={<MenuEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

const loaded = () => screen.findByRole('heading', { name: 'Appearance' });

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('the announcement bar', () => {
  it('switches on with its own words and colour', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: { 'PATCH /api/v1/site/layout': json(200, { data: LAYOUT }) },
    });
    await loaded();

    await user.click(screen.getByRole('checkbox', { name: 'Show it' }));
    await user.type(screen.getByLabelText('What it says'), 'Free delivery over 200 SAR');
    await user.selectOptions(screen.getByLabelText('Colour'), 'dark');
    await user.click(
      within(screen.getByText('Announcement bar').closest('[data-slot="card"]')).getByRole(
        'button',
        { name: 'Save' },
      ),
    );

    await waitFor(() => expect(m.count('PATCH /api/v1/site/layout')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/site/layout').announcement).toEqual({
      enabled: true,
      text: 'Free delivery over 200 SAR',
      href: '',
      tone: 'dark',
    });
  });

  it('shows the generated Arabic of a menu label, read-only', async () => {
    setup({ path: '/appearance/m1' });
    expect(await screen.findByText('كل المنتجات')).toHaveAttribute('dir', 'rtl');
  });
});

describe('the theme', () => {
  it('previews the shop’s colours and saves them as tokens', async () => {
    const user = userEvent.setup();
    const m = setup({ routes: { 'PATCH /api/v1/site/layout': json(200, { data: LAYOUT }) } });
    await loaded();

    const card = within(screen.getByText('Colours and shapes').closest('[data-slot="card"]'));
    await user.selectOptions(card.getByLabelText('Corners'), 'full');
    await user.click(card.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m.count('PATCH /api/v1/site/layout')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/site/layout').theme).toMatchObject({
      radius: 'full',
      primary: '#1f1f1f',
    });
  });
});

describe('where menus go', () => {
  it('puts a menu in the header, or leaves the categories there', async () => {
    const user = userEvent.setup();
    const m = setup({ routes: { 'PATCH /api/v1/site/layout': json(200, { data: LAYOUT }) } });
    await loaded();

    expect(screen.getByLabelText(/^Header menu/)).toHaveValue('');
    await user.selectOptions(screen.getByLabelText(/^Header menu/), 'm1');
    await user.click(
      within(screen.getByText('Header and footer').closest('[data-slot="card"]')).getByRole(
        'button',
        { name: 'Save' },
      ),
    );

    await waitFor(() => expect(m.count('PATCH /api/v1/site/layout')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/site/layout')).toMatchObject({
      headerMenuId: 'm1',
      showCategoryRow: true,
      footer: { note: '', menuIds: [] },
    });
  });

  it('starts a menu and opens it', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'POST /api/v1/site/menus': json(201, { data: { ...MENUS[0], id: 'm2', title: 'Help' } }),
        'GET /api/v1/site/menus/m2': json(200, { data: { ...MENUS[0], id: 'm2', title: 'Help' } }),
      },
    });
    await loaded();

    await user.type(screen.getByLabelText('Menu name'), 'Help');
    await user.selectOptions(screen.getByLabelText('Where it goes'), 'footer');
    await user.click(screen.getByRole('button', { name: 'Add menu' }));

    await waitFor(() => expect(m.count('POST /api/v1/site/menus')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/site/menus')).toEqual({ title: 'Help', location: 'footer' });
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeInTheDocument();
  });
});

describe('the menu editor', () => {
  it('adds a link that points at a page, and saves the whole menu', async () => {
    const user = userEvent.setup();
    const m = setup({
      path: '/appearance/m1',
      routes: { 'PATCH /api/v1/site/menus/m1': json(200, { data: MENUS[0] }) },
    });
    await screen.findByRole('heading', { name: 'Main menu' });

    await user.click(screen.getByRole('button', { name: 'Add a link' }));
    const rows = screen.getAllByRole('listitem');
    const fresh = within(rows.at(-1));
    await user.type(fresh.getByLabelText('Label'), 'About us');
    await user.selectOptions(fresh.getByLabelText('Points at'), 'page');
    await waitFor(() => expect(fresh.getByLabelText('Which page')).toBeInTheDocument());
    await user.selectOptions(fresh.getByLabelText('Which page'), 'pg1');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/site/menus/m1')).toBe(1));
    const saved = bodyOf(m, 'PATCH /api/v1/site/menus/m1');
    expect(saved.items).toHaveLength(2);
    expect(saved.items[1]).toMatchObject({ label: 'About us', target: 'page', ref: 'pg1' });
  });

  it('nests a link under another for a mega menu', async () => {
    const user = userEvent.setup();
    const m = setup({
      path: '/appearance/m1',
      routes: { 'PATCH /api/v1/site/menus/m1': json(200, { data: MENUS[0] }) },
    });
    await screen.findByRole('heading', { name: 'Main menu' });

    await user.click(screen.getByRole('button', { name: 'Add a link under this' }));
    const child = within(screen.getAllByRole('listitem').at(-1));
    await user.type(child.getByLabelText('Label'), 'Kettles');
    await user.selectOptions(child.getByLabelText('Points at'), 'category');
    await waitFor(() => expect(child.getByLabelText('Which category')).toBeInTheDocument());
    await user.selectOptions(child.getByLabelText('Which category'), 'c1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m.count('PATCH /api/v1/site/menus/m1')).toBe(1));
    const saved = bodyOf(m, 'PATCH /api/v1/site/menus/m1');
    expect(saved.items[0].children[0]).toMatchObject({
      label: 'Kettles',
      target: 'category',
      ref: 'c1',
    });
  });

  it('shows the server’s complaint next to the field it is about', async () => {
    const user = userEvent.setup();
    setup({
      path: '/appearance/m1',
      routes: {
        'PATCH /api/v1/site/menus/m1': json(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid',
            details: [{ path: 'items.0.label', message: 'validation.required' }],
          },
        }),
      },
    });
    await screen.findByRole('heading', { name: 'Main menu' });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('staff who may only look', () => {
  it('can read the appearance but change nothing', async () => {
    setup({ permissions: ['page.view'] });
    await loaded();
    expect(screen.getByRole('checkbox', { name: 'Show it' })).toBeDisabled();
    expect(screen.getByLabelText('What it says')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add menu' })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: 'Save' }))
      expect(button).toBeDisabled();
  });
});
