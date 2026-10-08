import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { CustomFieldsPage } from '../pages/CustomFieldsPage';

afterEach(() => vi.unstubAllGlobals());

describe('Custom fields page', () => {
  it('creates a dropdown field with keys derived from labels', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 't',
      profile: { name: 'A' },
      access: { permissions: ['customField.manage'] },
    });
    const m = mockFetch({
      'GET /api/v1/custom-fields': () => json(200, { data: [] }),
      'POST /api/v1/custom-fields': () => json(201, { data: {} }),
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CustomFieldsPage entity="product" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add field' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Label/), 'Fabric Type');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'select');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(m.count('POST /api/v1/custom-fields')).toBe(0); // dropdown needs choices
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add choice' }));
    await userEvent.type(within(dialog).getByLabelText('Choice 1'), 'Organic Cotton');
    await userEvent.selectOptions(within(dialog).getByLabelText('Visibility'), 'public');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(m.count('POST /api/v1/custom-fields')).toBe(1));
    expect(
      JSON.parse(m.calls.findLast((c) => c.key === 'POST /api/v1/custom-fields').init.body),
    ).toMatchObject({
      entity: 'product',
      key: 'fabric_type',
      type: 'select',
      label: 'Fabric Type',
      visibility: 'public',
      options: [{ key: 'organic_cotton', label: 'Organic Cotton' }],
    });
  });
});
