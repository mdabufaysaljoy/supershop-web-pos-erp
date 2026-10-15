import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

/** P4.5 — Settings → Notifications: the wording, the channels, and what actually went out. */
const TEMPLATES = [
  {
    id: 't1',
    key: 'order.placed.email',
    event: 'order.placed',
    channel: 'email',
    subject: { en: 'Your {{store.name}} order {{order.number}}', ar: 'طلبك' },
    body: { en: 'Hello {{customer.name}}', ar: 'مرحبا' },
    enabled: true,
    builtIn: true,
  },
  {
    id: 't2',
    key: 'order.shipped.sms',
    event: 'order.shipped',
    channel: 'sms',
    subject: { en: '' },
    body: { en: '{{store.name}}: order {{order.number}} is on its way' },
    enabled: false,
    builtIn: true,
  },
];
const SETTINGS = [
  { key: 'notifications.email', group: 'notifications', value: true, editable: true },
  { key: 'notifications.sms', group: 'notifications', value: false, editable: true },
  { key: 'notifications.emailProvider', group: 'notifications', value: 'smtp', editable: true },
  {
    key: 'notifications.emailFrom',
    group: 'notifications',
    value: 'shop@example.com',
    editable: true,
  },
  {
    key: 'notifications.emailFromName',
    group: 'notifications',
    value: 'Supershop',
    editable: true,
  },
  {
    key: 'notifications.smtpHost',
    group: 'notifications',
    value: 'smtp.example.com',
    editable: true,
  },
  { key: 'notifications.smtpPort', group: 'notifications', value: 587, editable: true },
  { key: 'notifications.smtpUser', group: 'notifications', value: 'shop', editable: true },
  { key: 'notifications.smsProvider', group: 'notifications', value: 'log', editable: true },
  {
    key: 'notifications.smtpPassword',
    group: 'notifications',
    value: { isSet: true, masked: 'abc…xyz' },
    secret: true,
  },
  {
    key: 'notifications.smsApiKey',
    group: 'notifications',
    value: { isSet: false, masked: '' },
    secret: true,
  },
];
const LOGS = [
  {
    id: 'l1',
    at: '2026-10-14T08:00:00.000Z',
    channel: 'email',
    event: 'order.placed',
    to: 'sara@example.com',
    lang: 'en',
    subject: 'Your Supershop order ORD-1',
    body: '…',
    status: 'sent',
    provider: 'smtp',
    error: null,
  },
];

const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);

/** The templates list and the log both mention events; scope queries to the one under test. */
const messages = () => within(screen.getByRole('list', { name: 'Messages' }));
/** Waits for the templates to arrive (the list element exists while they load). */
const loadedMessages = async () => {
  await screen.findAllByRole('checkbox', { name: 'Send it' });
  return messages();
};

function setup(permissions = ['settings.view', 'settings.notifications'], routes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/notifications/templates': json(200, { data: TEMPLATES }),
    'GET /api/v1/notifications/logs': json(200, { data: LOGS, meta: { total: 1 } }),
    'GET /api/v1/settings': json(200, { data: SETTINGS }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/settings?tab=notifications']}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('Settings → Notifications', () => {
  it('lists the messages with their channel and whether they are sent', async () => {
    setup();
    const list = await loadedMessages();
    expect(list.getByText('Order placed')).toBeInTheDocument();
    expect(list.getByText('Order shipped')).toBeInTheDocument();
    const [placed, shipped] = screen.getAllByRole('checkbox', { name: 'Send it' });
    expect(placed).toBeChecked();
    expect(shipped).not.toBeChecked();
  });

  it('shows the generated Arabic read-only beside the English a staff member edits', async () => {
    const user = userEvent.setup();
    setup();
    const row = (await loadedMessages()).getByText('Order placed').closest('li');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    expect(within(row).getByLabelText(/^Subject/)).toHaveValue(
      'Your {{store.name}} order {{order.number}}',
    );
    const arabic = within(row).getByText('طلبك');
    expect(arabic).toHaveAttribute('dir', 'rtl');
    expect(arabic.tagName).not.toBe('INPUT'); // read-only: Arabic is generated
  });

  it('saves a reworded message, English only', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.notifications'], {
      'PATCH /api/v1/notifications/templates/t1': ({ init }) =>
        json(200, { data: { ...TEMPLATES[0], ...JSON.parse(init.body) } }),
    });
    const row = (await loadedMessages()).getByText('Order placed').closest('li');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    await user.clear(within(row).getByLabelText(/^Subject/));
    await user.type(within(row).getByLabelText(/^Subject/), 'We have your order');
    await user.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(m.count('PATCH /api/v1/notifications/templates/t1')).toBe(1));
    const body = bodyOf(m, 'PATCH /api/v1/notifications/templates/t1');
    expect(body.subject).toBe('We have your order');
    expect(body).not.toHaveProperty('ar');
  });

  it('switches a channel off with one click', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.notifications'], {
      'PATCH /api/v1/settings': json(200, { data: SETTINGS }),
    });
    await loadedMessages();
    await user.click(screen.getByLabelText(/^Send emails/));
    await waitFor(() => expect(m.count('PATCH /api/v1/settings')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/settings')).toEqual({
      changes: [{ key: 'notifications.email', value: false }],
    });
  });

  it('sends a test message to an address the admin types', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.notifications'], {
      'POST /api/v1/notifications/test': json(200, { data: { status: 'sent' } }),
    });
    await loadedMessages();
    await user.type(screen.getByLabelText('Send a test email to'), 'owner@shop.test');
    await user.click(screen.getAllByRole('button', { name: 'Send test' })[0]);
    await waitFor(() => expect(m.count('POST /api/v1/notifications/test')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/notifications/test')).toEqual({
      channel: 'email',
      to: 'owner@shop.test',
    });
  });

  it('never shows a stored password, only that one is set', async () => {
    setup();
    expect(await screen.findByText('Stored: abc…xyz')).toBeInTheDocument();
    expect(screen.getByLabelText(/^SMTP password/)).toHaveValue('');
    expect(screen.getByText('Not set yet.')).toBeInTheDocument(); // the SMS key
  });

  it('shows what went out, with the service that carried it', async () => {
    setup();
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('sara@example.com')).toBeInTheDocument();
  });

  it('lets read-only staff look without touching', async () => {
    setup(['settings.view']);
    await loadedMessages();
    for (const box of screen.getAllByRole('checkbox', { name: 'Send it' }))
      expect(box).toBeDisabled();
    expect(screen.getByLabelText(/^Send emails/)).toBeDisabled();
  });
});
