import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { SettingsPage } from '../pages/SettingsPage';

const SETTINGS = [
  { key: 'i18n.provider', group: 'languages', value: 'libretranslate', editable: true },
  {
    key: 'i18n.libretranslateUrl',
    group: 'languages',
    value: 'http://localhost:5000',
    editable: true,
  },
  { key: 'i18n.monthlyCharBudget', group: 'languages', value: 0, editable: true },
  {
    key: 'i18n.libretranslateApiKey',
    group: 'languages',
    value: { isSet: false, masked: '' },
    secret: true,
  },
  { key: 'i18n.autoDetect', group: 'languages', value: false, editable: true },
  { key: 'i18n.digitStyle', group: 'languages', value: 'latn', editable: true },
];
const OVERVIEW = {
  provider: 'libretranslate',
  enabled: true,
  usage: { month: '2026-10', chars: 1234, budget: 0 },
  languages: [],
  content: [],
  queue: {
    counts: { waiting: 0, active: 0, delayed: 0, failed: 1, completed: 9 },
    failed: [{ id: 'tr-1', reason: 'boom' }],
  },
};

function setup(permissions, extraRoutes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/settings': json(200, { data: SETTINGS }),
    'GET /api/v1/i18n/overview': json(200, { data: OVERVIEW }),
    'GET /api/v1/i18n/glossary': json(200, { data: [] }),
    'GET /api/v1/i18n/admin/ui-overrides/storefront/ar': json(200, { data: [] }),
    ...extraRoutes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/settings?tab=languages']}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('Settings → Languages', () => {
  it('read-only users see everything but cannot change anything', async () => {
    setup(['settings.view']);
    expect(
      await screen.findByText('You can view these settings but not change them.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Translation engine')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Retranslate everything/ })).toBeNull();
    expect(screen.getByText(/Used in 2026-10: 1,234 characters of unlimited/)).toBeInTheDocument();
  });

  it('lists storefront text that needs review and saves a correction with its English source', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.languages'], {
      'PUT /api/v1/i18n/admin/ui-overrides/storefront/ar/nav.home': ({ init }) =>
        json(200, { data: { key: 'nav.home', ...JSON.parse(init.body), srcHash: 'x' } }),
    });
    // Default filter = needs review: footer.rights is shown in English (engine failed on it).
    expect(await screen.findByText('footer.rights')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Show'), 'all');
    const input = screen.getByLabelText('Arabic for nav.home');
    await user.clear(input);
    await user.type(input, 'CORRECTED');
    const row = input.closest('li');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(m.count('PUT /api/v1/i18n/admin/ui-overrides/storefront/ar/nav.home')).toBe(1),
    );
    const sent = JSON.parse(m.calls.find((c) => c.key.startsWith('PUT')).init.body);
    expect(sent).toEqual({ value: 'CORRECTED', source: 'Home' });
  });

  it('shows the placeholder rule inline when a correction drops {{store}}', async () => {
    const user = userEvent.setup();
    setup(['settings.view', 'settings.languages'], {
      'PUT /api/v1/i18n/admin/ui-overrides/storefront/ar/home.title': json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ path: 'value', message: 'validation.placeholdersChanged' }],
        },
      }),
    });
    await user.selectOptions(await screen.findByLabelText('Show'), 'all');
    const input = screen.getByLabelText('Arabic for home.title');
    await user.clear(input);
    await user.type(input, 'NO PLACEHOLDER');
    await user.click(within(input.closest('li')).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Keep every placeholder like \{\{name\}\}/)).toBeInTheDocument();
  });

  it('"Retranslate everything" needs a second, explicit confirmation', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.languages'], {
      'POST /api/v1/i18n/retranslate': json(202, { data: { scheduled: 3 } }),
    });
    await user.click(await screen.findByRole('button', { name: /Retranslate everything/ }));
    expect(m.count('POST /api/v1/i18n/retranslate')).toBe(0);
    await user.click(screen.getByRole('button', { name: /Yes, retranslate all/ }));
    await waitFor(() => expect(m.count('POST /api/v1/i18n/retranslate')).toBe(1));
    expect(
      JSON.parse(m.calls.find((c) => c.key === 'POST /api/v1/i18n/retranslate').init.body),
    ).toEqual({ scope: 'all' });
  });

  it('digit style options show generated samples (Western vs Arabic-Indic)', async () => {
    setup(['settings.view', 'settings.languages']);
    const select = await screen.findByLabelText('Digits on the Arabic site');
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels[0]).toBe('Western (1234567890)');
    expect(labels[1]).toMatch(/^Arabic-Indic \(\p{Nd}{10}\)$/u);
    expect(labels[1]).not.toMatch(/[0-9]/);
  });
});
