import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { StoreDetailsTab } from '../pages/StoreDetailsTab';

const GENERAL = [
  { key: 'store.name', group: 'general', value: 'Wafa Supershop' },
  { key: 'store.currency', group: 'general', value: 'SAR' },
  { key: 'store.timeZone', group: 'general', value: 'Asia/Riyadh' },
];
const TAX = [{ key: 'tax.vatNumber', group: 'tax', value: '' }];
const LAYOUT = {
  contact: { phone: '+966500000000', whatsapp: '', email: 'hello@wafa.test', address: 'Riyadh' },
  theme: { primary: '#2563eb', primaryForeground: '#ffffff', radius: 'full', font: 'bundled' },
};

const MANAGE = ['settings.view', 'settings.general', 'menu.manage'];

function setup(permissions = MANAGE, routes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/settings': ({ url }) =>
      json(200, { data: url.searchParams.get('group') === 'tax' ? TAX : GENERAL }),
    'GET /api/v1/site/layout': () => json(200, { data: LAYOUT }),
    'PATCH /api/v1/settings': () => json(200, { data: GENERAL }),
    'PATCH /api/v1/site/layout': () => json(200, { data: LAYOUT }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <StoreDetailsTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Settings → Store details', () => {
  it('shows what the shop is called and how it counts money and time', async () => {
    setup();
    expect(await screen.findByLabelText(/^Store name/)).toHaveValue('Wafa Supershop');
    expect(screen.getByLabelText('Currency')).toHaveValue('SAR');
    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Riyadh');
    expect(screen.getByLabelText('Email')).toHaveValue('hello@wafa.test');
  });

  it('saves the name and the VAT number the receipts are written with', async () => {
    const user = userEvent.setup();
    const m = setup();
    const name = await screen.findByLabelText(/^Store name/);
    await user.clear(name);
    await user.type(name, 'Al Noor Market');
    await user.type(screen.getByLabelText(/VAT registration number/), '300000000000003');
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    await waitFor(() => expect(m.count('PATCH /api/v1/settings')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/settings').changes).toEqual(
      expect.arrayContaining([
        { key: 'store.name', value: 'Al Noor Market' },
        { key: 'tax.vatNumber', value: '300000000000003' },
      ]),
    );
  });

  it('saves both brand colours, and shows the pair before they are saved', async () => {
    const user = userEvent.setup();
    const m = setup();
    // The hex box and the swatch beside it edit the same colour.
    const hex = await screen.findByLabelText('Secondary');
    await user.clear(hex);
    await user.type(hex, '#fde68a');
    expect(screen.getByLabelText('Pick Secondary')).toHaveValue('#fde68a');

    const preview = screen.getByLabelText('Colour preview');
    expect(within(preview).getByText('Secondary')).toHaveStyle({ background: '#fde68a' });

    await user.click(screen.getAllByRole('button', { name: 'Save' }).at(-1));
    await waitFor(() => expect(m.count('PATCH /api/v1/site/layout')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/site/layout').theme).toMatchObject({
      primary: '#2563eb',
      secondary: '#fde68a',
      radius: 'full',
    });
  });

  it('is read-only for someone who may look at settings but not change them', async () => {
    setup(['settings.view']);
    expect(await screen.findByLabelText(/^Store name/)).toBeDisabled();
    expect(screen.getByLabelText('Primary')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
