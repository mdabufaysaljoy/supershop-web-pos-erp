import { describe, expect, it, vi } from 'vitest';
import { createPaymentProvider } from '../index.js';

/** P4.1 — the gateway adapter in isolation: what we send, and how its words become ours. */
const provider = (handler) =>
  createPaymentProvider({ provider: 'moyasar', secretKey: 'sk_test_123', fetchImpl: handler });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('registry', () => {
  it('returns nothing when no gateway is configured, and refuses an unknown one', () => {
    expect(createPaymentProvider({ provider: 'none' })).toBeNull();
    expect(() => createPaymentProvider({ provider: 'bitcoin' })).toThrow(/Unknown payment gateway/);
  });

  it('is disabled without a secret key', () => {
    expect(createPaymentProvider({ provider: 'moyasar', secretKey: '' }).enabled).toBe(false);
  });
});

describe('creating a hosted payment page', () => {
  it('sends halalas and the callback with Basic auth, and returns the page URL', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ id: 'inv_9', status: 'initiated', amount: 23000, url: 'https://pay.test/inv_9' }),
    );
    const payment = await provider(fetchImpl).createCheckout({
      amount: 23000,
      currency: 'SAR',
      description: 'ORD-000007',
      callbackUrl: 'https://shop.test/checkout/confirmation?token=abc',
      metadata: { orderNo: 'ORD-000007' },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.moyasar.com/v1/invoices');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('sk_test_123:').toString('base64')}`,
    );
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 23000,
      currency: 'SAR',
      callback_url: 'https://shop.test/checkout/confirmation?token=abc',
    });
    expect(payment).toMatchObject({
      gatewayRef: 'inv_9',
      status: 'pending',
      redirectUrl: 'https://pay.test/inv_9',
    });
  });

  it('turns a gateway error into PAYMENT_FAILED, never a crash', async () => {
    await expect(
      provider(async () => json({ message: 'amount is too small' }, 400)).createCheckout({
        amount: 1,
        currency: 'SAR',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_FAILED', status: 502 });

    await expect(
      provider(async () => {
        throw new Error('network down');
      }).createCheckout({ amount: 23000, currency: 'SAR' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_FAILED' });
  });
});

describe('reading a payment', () => {
  it('maps the gateway vocabulary onto ours and finds the captured charge', async () => {
    const paid = await provider(async () =>
      json({
        id: 'inv_9',
        status: 'paid',
        amount: 23000,
        payments: [{ id: 'pay_9', status: 'paid' }],
      }),
    ).fetchPayment('inv_9');
    expect(paid).toMatchObject({ status: 'paid', paidAmount: 23000, chargeRef: 'pay_9' });

    for (const [theirs, ours] of [
      ['initiated', 'pending'],
      ['authorized', 'authorized'],
      ['captured', 'paid'],
      ['failed', 'failed'],
      ['voided', 'failed'],
      ['expired', 'failed'],
      ['refunded', 'refunded'],
    ]) {
      const read = await provider(async () =>
        json({ id: 'inv_9', status: theirs, amount: 1 }),
      ).fetchPayment('inv_9');
      expect(read.status).toBe(ours);
    }
  });
});

describe('refunds', () => {
  it('refunds the charge, not the invoice', async () => {
    const fetchImpl = vi.fn(async () => json({ id: 'ref_1', status: 'refunded', refunded: 3000 }));
    const result = await provider(fetchImpl).refund({ chargeRef: 'pay_9', amount: 3000 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.moyasar.com/v1/payments/pay_9/refund');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ amount: 3000 });
    expect(result).toMatchObject({ refundRef: 'ref_1', status: 'refunded', amount: 3000 });
  });

  it('refuses when the charge is not known yet', async () => {
    await expect(provider(async () => json({})).refund({ chargeRef: null })).rejects.toMatchObject({
      code: 'PAYMENT_FAILED',
    });
  });
});

describe('webhooks', () => {
  const event = (over = {}) =>
    JSON.stringify({
      id: 'evt_1',
      type: 'invoice_paid',
      secret_token: 'whsec',
      data: { id: 'inv_9', status: 'paid', amount: 23000, payments: [{ id: 'pay_9' }] },
      ...over,
    });

  it('accepts a correctly signed event and reports what changed', () => {
    const parsed = provider(async () => json({})).parseWebhook({
      rawBody: Buffer.from(event()),
      secret: 'whsec',
    });
    expect(parsed).toMatchObject({
      ok: true,
      eventId: 'evt_1',
      gatewayRef: 'inv_9',
      status: 'paid',
      amount: 23000,
      chargeRef: 'pay_9',
    });
  });

  it('refuses a wrong token, a missing secret and a malformed body', () => {
    const p = provider(async () => json({}));
    expect(
      p.parseWebhook({ rawBody: event({ secret_token: 'nope' }), secret: 'whsec' }),
    ).toMatchObject({
      ok: false,
      reason: 'signature',
    });
    expect(p.parseWebhook({ rawBody: event(), secret: '' })).toMatchObject({ ok: false });
    expect(p.parseWebhook({ rawBody: 'not json', secret: 'whsec' })).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });
});
