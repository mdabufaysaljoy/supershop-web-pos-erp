import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPaymentProvider } from '../index.js';

const provider = (handler, opts = {}) =>
  createPaymentProvider({
    provider: 'stripe',
    secretKey: opts.secretKey ?? 'sk_test_123',
    fetchImpl: handler,
  });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('stripe registry', () => {
  it('instantiates stripe provider and reflects enabled state', () => {
    const p = createPaymentProvider({ provider: 'stripe', secretKey: 'sk_test_abc' });
    expect(p).not.toBeNull();
    expect(p.name).toBe('stripe');
    expect(p.enabled).toBe(true);

    expect(createPaymentProvider({ provider: 'stripe', secretKey: '' }).enabled).toBe(false);
  });

  it('rejects publishable key (pk_...) with informative PAYMENT_FAILED error', async () => {
    const p = provider(async () => json({}), { secretKey: 'pk_test_12345' });
    await expect(
      p.createCheckout({
        amount: 5000,
        currency: 'SAR',
        orderNo: 'ORD-1',
        callbackUrl: 'https://shop.test/cb',
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_FAILED',
      message: expect.stringContaining('publishable key'),
    });
  });
});

describe('stripe checkout sessions', () => {
  it('creates a checkout session with form-encoded line items and returns the redirect URL', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        id: 'cs_test_abc123',
        url: 'https://checkout.stripe.com/pay/cs_test_abc123',
        status: 'open',
        payment_status: 'unpaid',
        amount_total: 25000,
      }),
    );

    const payment = await provider(fetchImpl).createCheckout({
      orderNo: 'ORD-000031',
      amount: 25000,
      currency: 'SAR',
      description: 'Order ORD-000031',
      callbackUrl: 'https://shop.test/checkout/confirmation?token=tok123',
      metadata: { orderNo: 'ORD-000031', orderId: '654321' },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk_test_123');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const bodyStr = decodeURIComponent(init.body);
    expect(bodyStr).toContain('mode=payment');
    expect(bodyStr).toContain('client_reference_id=ORD-000031');
    expect(bodyStr).toContain('line_items[0][price_data][unit_amount]=25000');
    expect(bodyStr).toContain('line_items[0][price_data][currency]=sar');
    expect(bodyStr).toContain('metadata[orderNo]=ORD-000031');

    expect(payment).toMatchObject({
      gatewayRef: 'cs_test_abc123',
      status: 'pending',
      amount: 25000,
      paidAmount: 0,
      redirectUrl: 'https://checkout.stripe.com/pay/cs_test_abc123',
    });
  });

  it('maps gateway errors to PAYMENT_FAILED', async () => {
    await expect(
      provider(async () => json({ error: { message: 'Invalid currency' } }, 400)).createCheckout({
        amount: 100,
        currency: 'INVALID',
        orderNo: 'ORD-2',
        callbackUrl: 'https://shop.test/cb',
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_FAILED',
      message: 'Invalid currency',
      status: 502,
    });
  });
});

describe('stripe payment sync (fetchPayment)', () => {
  it('reads session and maps paid status and chargeRef (payment_intent)', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        id: 'cs_test_xyz',
        status: 'complete',
        payment_status: 'paid',
        amount_total: 15000,
        payment_intent: 'pi_test_intent_789',
        url: 'https://checkout.stripe.com/pay/cs_test_xyz',
      }),
    );

    const result = await provider(fetchImpl).fetchPayment('cs_test_xyz');
    expect(result).toMatchObject({
      gatewayRef: 'cs_test_xyz',
      status: 'paid',
      amount: 15000,
      paidAmount: 15000,
      chargeRef: 'pi_test_intent_789',
    });
  });

  it('maps expired session to failed status', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        id: 'cs_test_expired',
        status: 'expired',
        payment_status: 'unpaid',
        amount_total: 10000,
      }),
    );

    const result = await provider(fetchImpl).fetchPayment('cs_test_expired');
    expect(result).toMatchObject({
      gatewayRef: 'cs_test_expired',
      status: 'failed',
      paidAmount: 0,
    });
  });
});

describe('stripe refunds', () => {
  it('refunds via PaymentIntent directly', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        id: 're_test_999',
        status: 'succeeded',
        amount: 5000,
      }),
    );

    const result = await provider(fetchImpl).refund({
      chargeRef: 'pi_test_intent_789',
      amount: 5000,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/refunds');
    expect(init.method).toBe('POST');
    expect(decodeURIComponent(init.body)).toContain('payment_intent=pi_test_intent_789');
    expect(decodeURIComponent(init.body)).toContain('amount=5000');

    expect(result).toMatchObject({
      refundRef: 're_test_999',
      status: 'refunded',
      amount: 5000,
    });
  });

  it('resolves payment_intent from checkout session when only gatewayRef is provided', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/checkout/sessions/cs_test_session')) {
        return json({ id: 'cs_test_session', payment_intent: 'pi_resolved_from_session' });
      }
      return json({ id: 're_test_auto', status: 'succeeded', amount: 2000 });
    });

    const result = await provider(fetchImpl).refund({
      gatewayRef: 'cs_test_session',
      amount: 2000,
    });

    expect(result).toMatchObject({
      refundRef: 're_test_auto',
      status: 'refunded',
      amount: 2000,
    });
  });
});

describe('stripe webhooks', () => {
  const secret = 'whsec_test_secret_123';

  const makePayload = (bodyObj) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(bodyObj);
    const sig = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const header = `t=${timestamp},v1=${sig}`;
    return { rawBody, headers: { 'stripe-signature': header } };
  };

  it('validates signature and handles checkout.session.completed', () => {
    const { rawBody, headers } = makePayload({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_completed',
          payment_intent: 'pi_test_intent_1',
          payment_status: 'paid',
          status: 'complete',
          amount_total: 30000,
        },
      },
    });

    const parsed = provider(async () => json({})).parseWebhook({
      rawBody: Buffer.from(rawBody),
      headers,
      secret,
    });

    expect(parsed).toMatchObject({
      ok: true,
      eventId: 'evt_test_1',
      type: 'checkout.session.completed',
      gatewayRef: 'cs_test_completed',
      chargeRef: 'pi_test_intent_1',
      status: 'paid',
      amount: 30000,
    });
  });

  it('refuses invalid signature or missing secret', () => {
    const { rawBody } = makePayload({ id: 'evt_1', type: 'test' });
    const p = provider(async () => json({}));

    // Bad signature
    expect(
      p.parseWebhook({
        rawBody,
        headers: { 'stripe-signature': 't=12345,v1=bad_signature' },
        secret,
      }),
    ).toMatchObject({ ok: false, reason: 'signature' });

    // Missing secret
    expect(
      p.parseWebhook({
        rawBody,
        headers: { 'stripe-signature': 't=12345,v1=any' },
        secret: '',
      }),
    ).toMatchObject({ ok: false, reason: 'missing_secret' });

    // Missing header
    expect(
      p.parseWebhook({
        rawBody,
        headers: {},
        secret,
      }),
    ).toMatchObject({ ok: false, reason: 'signature' });
  });
});
