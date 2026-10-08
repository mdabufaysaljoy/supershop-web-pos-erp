import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { CategoriesPage } from '../pages/CategoriesPage';

const cat = (id, name, parentId = null, position = 0, extra = {}) => ({
  id,
  name: { en: name },
  description: { en: '' },
  slug: name.toLowerCase(),
  parentId,
  depth: parentId ? 1 : 0,
  position,
  isActive: true,
  image: null,
  seo: { title: { en: '' }, description: { en: '' } },
  updatedAt: '2026-10-08T10:00:00.000Z',
  ...extra,
});
const ID = (n) => `64b00000000000000000000${n}`;
const LIST = [
  cat(ID(1), 'Electronics', null, 0, {
    name: { en: 'Electronics', ar: 'X', meta: { ar: { mode: 'auto', status: 'done' } } },
  }),
  cat(ID(2), 'Phones', ID(1), 0),
  cat(ID(3), 'Fashion', null, 1, { isActive: false }),
];

function setup(routes) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions: ['category.manage', 'media.manage'] },
  });
  const m = mockFetch({ 'GET /api/v1/categories': () => json(200, { data: LIST }), ...routes });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.find((c) => c.key === key).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Categories page', () => {
  it('shows the nested tree with hidden badges and drag handles', async () => {
    setup({});
    expect(await screen.findByRole('button', { name: 'Electronics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phones' })).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Phones' })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide subcategories of Electronics' }),
    );
    expect(screen.queryByRole('button', { name: 'Phones' })).toBeNull();
  });

  it('creates a subcategory: validates on the client with the shared schema first', async () => {
    const m = setup({
      'POST /api/v1/categories': () => json(201, { data: cat(ID(4), 'Tablets', ID(1), 1) }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a subcategory to Electronics' }),
    );
    expect(screen.getByLabelText('Parent category')).toHaveValue(ID(1));
    await userEvent.click(screen.getByRole('button', { name: 'Create category' }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(m.count('POST /api/v1/categories')).toBe(0);

    await userEvent.type(screen.getByLabelText(/^Name/), 'Tablets');
    expect(screen.getByLabelText('URL slug')).toHaveAttribute('placeholder', 'tablets');
    await userEvent.type(screen.getByLabelText('SEO title'), 'Buy tablets');
    expect(screen.getByText('11 / 70 characters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create category' }));
    await waitFor(() => expect(m.count('POST /api/v1/categories')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/categories')).toEqual({
      name: 'Tablets',
      description: '',
      isActive: true,
      imageId: null,
      seo: { title: 'Buy tablets', description: '' },
      parentId: ID(1),
    });
  });

  it('edits, shows server field errors, moves on parent change', async () => {
    let patchAttempts = 0;
    const m = setup({
      [`PATCH /api/v1/categories/${ID(2)}`]: () =>
        ++patchAttempts === 1
          ? json(409, {
              error: {
                code: 'SLUG_TAKEN',
                message: 'x',
                details: [{ path: 'slug', message: 'validation.duplicate' }],
              },
            })
          : json(200, { data: LIST[1] }),
      [`POST /api/v1/categories/${ID(2)}/move`]: () => json(200, { data: LIST[1] }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Phones' }));
    const slug = screen.getByLabelText('URL slug');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'Fashion Wear');
    expect(slug).toHaveValue('fashionwear');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Already in use.')).toBeInTheDocument();
    expect(m.count(`POST /api/v1/categories/${ID(2)}/move`)).toBe(0);

    await userEvent.selectOptions(screen.getByLabelText('Parent category'), ID(3));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count(`POST /api/v1/categories/${ID(2)}/move`)).toBe(1));
    expect(bodyOf(m, `POST /api/v1/categories/${ID(2)}/move`)).toEqual({
      parentId: ID(3),
      index: 0,
    });
  });

  it('parent options exclude the category itself and its subtree; Arabic preview shown', async () => {
    setup({});
    await userEvent.click(await screen.findByRole('button', { name: 'Electronics' }));
    const options = within(screen.getByLabelText('Parent category'))
      .getAllByRole('option')
      .map((o) => o.textContent.trim());
    expect(options).toEqual(['None (top level)', 'Fashion']);
    expect(screen.getByText('Arabic name')).toBeInTheDocument();
    expect(screen.getByText('Translated')).toBeInTheDocument();
  });
});
