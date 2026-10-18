// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontNewsletterBlock } from '../components/home/StorefrontNewsletterBlock';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StorefrontNewsletterBlock', () => {
  it('renders heading, description, and input with default offer update texts', () => {
    render(<StorefrontNewsletterBlock />);

    expect(
      screen.getByRole('heading', { name: 'Subscribe for new offer updates' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Get exclusive deals, flash discounts, and new arrivals delivered straight to your inbox.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Subscribe/i })).toBeInTheDocument();
  });

  it('submits email via AJAX without page redirect and displays confirmation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            success: true,
            subscriber: { email: 'shopper@test.com' },
            alreadySubscribed: false,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<StorefrontNewsletterBlock />);

    const input = screen.getByPlaceholderText('Email address');
    await user.type(input, 'shopper@test.com');
    await user.click(screen.getByRole('button', { name: /Subscribe/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/newsletter',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'shopper@test.com', source: 'storefront_newsletter' }),
        }),
      );
    });

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Subscription Confirmed/i)).toBeInTheDocument();
  });

  it('displays already-subscribed message when email is already registered', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            success: true,
            alreadySubscribed: true,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<StorefrontNewsletterBlock />);

    const input = screen.getByPlaceholderText('Email address');
    await user.type(input, 'repeat@test.com');
    await user.click(screen.getByRole('button', { name: /Subscribe/i }));

    expect(await screen.findByText('Already Subscribed')).toBeInTheDocument();
  });
});
