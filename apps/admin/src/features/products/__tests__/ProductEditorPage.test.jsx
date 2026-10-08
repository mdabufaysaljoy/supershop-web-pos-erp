import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { ProductEditorPage } from '../pages/ProductEditorPage';
import { ProductsPage } from '../pages/ProductsPage';

const ID = (n) => `64b0000000000000000000${String(n).padStart(2, '0')}`;
const CATEGORY = { id: ID(1), name: { en: 'Men' }, parentId: null, position: 0 };
const PRODUCT = {
  id: ID(10),
  name: { en: 'Cotton Tee', ar: 'X', meta: { ar: { mode: 'auto', status: 'done' } } },
  slug: 'cotton-tee',
  shortDescription: { en: '' },
  description: { en: '' },
  status: 'active',
  taxCategory: 'standard',
  categoryIds: [ID(1)],
  brandId: null,
  supplierId: null,
  tags: ['summer'],
  images: [],
  options: [
    {
      key: 'size',
      name: { en: 'Size' },
      values: [
        { key: 'm', label: { en: 'M' }, swatch: null },
        { key: 'l', label: { en: 'L' }, swatch: null },
      ],
    },
  ],
  variants: [
    {
      id: ID(20),
      sku: 'TEE-M',
      barcode: null,
      optionValues: { size: 'm' },
      price: 4900,
      compareAtPrice: null,
      cost: 2000,
      imageIds: [],
      weightGrams: null,
      isActive: true,
    },
    {
      id: ID(21),
      sku: 'TEE-L',
      barcode: null,
      optionValues: { size: 'l' },
      price: 4900,
      compareAtPrice: null,
      cost: 2100,
      imageIds: [],
      weightGrams: null,
      isActive: true,
    },
  ],
  customFields: {},
  seo: { title: { en: '' }, description: { en: '' } },
  updatedAt: '2026-10-08T10:00:00.000Z',
};
const list = (data) => json(200, { data, meta: { page: 1, limit: 100, total: data.length } });

function setup(path, permissions, routes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/categories': () => json(200, { data: [CATEGORY] }),
    'GET /api/v1/brands': () => list([]),
    'GET /api/v1/suppliers': () => list([]),
    'GET /api/v1/custom-fields': () => json(200, { data: [] }),
    'GET /api/v1/products': () => list([]),
    [`GET /api/v1/products/${PRODUCT.id}`]: () => json(200, { data: PRODUCT }),
    ...routes,
  });
  const router = createMemoryRouter(
    [
      { path: '/products', element: <ProductsPage /> },
      { path: '/products/new', element: <ProductEditorPage /> },
      { path: '/products/:id', element: <ProductEditorPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { m, router };
}
const body = (m, key) => JSON.parse(m.calls.findLast((c) => c.key === key).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Product editor', () => {
  it('creates a product: options build the variant matrix; money sent in halalas; no cost without permission', async () => {
    const { m, router } = setup('/products/new', ['product.view', 'product.create'], {
      'POST /api/v1/products': () => json(201, { data: { ...PRODUCT, id: ID(11) } }),
      [`GET /api/v1/products/${ID(11)}`]: () => json(200, { data: { ...PRODUCT, id: ID(11) } }),
    });
    await userEvent.type(await screen.findByLabelText(/^Product name/), 'Linen Shirt');
    await userEvent.type(screen.getByLabelText('Default price'), '129');
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    await userEvent.type(screen.getByLabelText('Option name'), 'Color');
    const addValue = screen.getByLabelText('Add a value');
    await userEvent.type(addValue, 'White{Enter}');
    await userEvent.type(addValue, 'Sky Blue{Enter}');
    expect(screen.getByText('Variants (2)')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU for Sky Blue')).toHaveValue('LINEN-SHIRT-SKY-BLUE');
    expect(screen.queryByText('Cost')).toBeNull();
    await userEvent.clear(screen.getByLabelText('Price for White'));
    await userEvent.type(screen.getByLabelText('Price for White'), '119.5');
    await userEvent.click(screen.getByRole('checkbox', { name: /Men/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Create product' }));
    await waitFor(() => expect(m.count('POST /api/v1/products')).toBe(1));
    const sent = body(m, 'POST /api/v1/products');
    expect(sent).toMatchObject({
      name: 'Linen Shirt',
      categoryIds: [ID(1)],
      options: [
        {
          key: 'color',
          name: 'Color',
          values: [
            { key: 'white', label: 'White' },
            { key: 'sky-blue', label: 'Sky Blue' },
          ],
        },
      ],
      variants: [
        { sku: 'LINEN-SHIRT-WHITE', optionValues: { color: 'white' }, price: 11950 },
        { sku: 'LINEN-SHIRT-SKY-BLUE', optionValues: { color: 'sky-blue' }, price: 12900 },
      ],
    });
    expect(sent.variants[0]).not.toHaveProperty('cost');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/products/${ID(11)}`));
  });

  it('client-side validation with the shared schema blocks the request', async () => {
    const { m } = setup('/products/new', ['product.view', 'product.create']);
    await userEvent.click(await screen.findByRole('button', { name: 'Create product' }));
    expect(await screen.findByText(/Please fix \d+ field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Product name/)).toHaveAttribute('aria-invalid', 'true');
    expect(m.count('POST /api/v1/products')).toBe(0);
  });

  it('edits with cost; server field errors land on the right cell', async () => {
    const { m } = setup(
      `/products/${PRODUCT.id}`,
      ['product.view', 'product.update', 'product.viewCost'],
      {
        [`PATCH /api/v1/products/${PRODUCT.id}`]: () =>
          json(409, {
            error: {
              code: 'SKU_TAKEN',
              message: 'x',
              details: [{ path: 'variants.1.sku', message: 'validation.duplicate' }],
            },
          }),
      },
    );
    expect(await screen.findByLabelText('Cost for L')).toHaveValue('21.00');
    expect(screen.getByText('Arabic name')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Price for M'));
    await userEvent.type(screen.getByLabelText('Price for M'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count(`PATCH /api/v1/products/${PRODUCT.id}`)).toBe(1));
    const sent = body(m, `PATCH /api/v1/products/${PRODUCT.id}`);
    expect(sent.variants).toEqual([
      expect.objectContaining({ id: ID(20), sku: 'TEE-M', price: 4500, cost: 2000 }),
      expect.objectContaining({ id: ID(21), sku: 'TEE-L', price: 4900, cost: 2100 }),
    ]);
    expect(await screen.findByText('Already in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU for L')).toHaveAttribute('aria-invalid', 'true');
  });

  it('read-only for staff without product.update', async () => {
    setup(`/products/${PRODUCT.id}`, ['product.view']);
    expect(
      await screen.findByText('You can view this product but not change it.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Product name/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByLabelText('Cost for L')).toBeNull();
  });

  it('asks before leaving with unsaved changes', async () => {
    const { router } = setup(`/products/${PRODUCT.id}`, ['product.view', 'product.update']);
    await userEvent.type(await screen.findByLabelText(/^Product name/), ' Pro');
    await userEvent.click(screen.getAllByRole('link', { name: 'Products' })[0]);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toBe(`/products/${PRODUCT.id}`);
    await userEvent.click(screen.getAllByRole('link', { name: 'Products' })[0]);
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/products'));
  });
});
