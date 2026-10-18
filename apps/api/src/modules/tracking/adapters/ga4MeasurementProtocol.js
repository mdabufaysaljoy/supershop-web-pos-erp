import { sha256 } from '../../../core/crypto.js';

/**
 * GA4 Measurement Protocol adapter.
 * Sends server-side conversion events to Google Analytics 4.
 *
 * @param {object} params
 * @param {object} params.config Integration clientConfig (measurementId, debugMode)
 * @param {object} params.credentials Decrypted credentials (apiSecret)
 * @param {object} params.payload Event payload (event, eventId, orderNumber, value, currency, items, customer, attribution)
 * @param {object} [params.options]
 * @param {typeof fetch} [params.options.fetchImpl] Custom fetch for testing
 * @param {boolean} [params.options.debug] Force debug validation endpoint
 * @returns {Promise<{ success: boolean, response: object, isDebug: boolean }>}
 */
export async function dispatchGa4Mp({ config = {}, credentials = {}, payload = {}, options = {} }) {
  const measurementId = config.measurementId;
  const apiSecret = credentials.apiSecret;

  if (!measurementId || !apiSecret) {
    throw new Error('GA4 MP requires measurementId in config and apiSecret in credentials');
  }

  const fetcher = options.fetchImpl || fetch;
  const isDebug = Boolean(options.debug || config.debugMode || options.isTest || payload.isTest);

  const customer = payload.customer || {};
  const attribution = payload.attribution || {};

  // GA4 client_id resolution: attribution gaClientId -> hashed email -> fallback deterministic server id
  let clientId = attribution.gaClientId || payload.gaClientId;
  if (!clientId && customer.email) {
    clientId = sha256(customer.email.trim().toLowerCase()).slice(0, 32);
  }
  if (!clientId) {
    clientId = `server.${payload.orderNumber || payload.eventId || Date.now()}`;
  }

  const userId = customer.customerId || customer.id || undefined;

  const eventParams = {
    currency: payload.currency || 'SAR',
    ...(payload.orderNumber && { transaction_id: payload.orderNumber }),
    ...(payload.eventId && { event_id: payload.eventId }),
    ...(typeof payload.value === 'number' && { value: payload.value }),
  };

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    eventParams.items = payload.items.map((i) => ({
      item_id: String(i.item_id || i.sku || i.id || ''),
      item_name: String(i.item_name || i.name || ''),
      quantity: Number(i.quantity) || 1,
      ...(typeof i.price === 'number' && { price: i.price }),
    }));
  }

  const requestBody = {
    client_id: clientId,
    ...(userId && { user_id: String(userId) }),
    timestamp_micros: Date.now() * 1000,
    events: [
      {
        name: payload.event,
        params: eventParams,
      },
    ],
  };

  const endpointBase = isDebug
    ? 'https://www.google-analytics.com/debug/mp/collect'
    : 'https://www.google-analytics.com/mp/collect';

  const url = `${endpointBase}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  let responseBody = null;
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = { raw: text };
    }
  }

  if (!response.ok) {
    const errorMsg =
      responseBody?.error?.message || `GA4 MP request failed with HTTP ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.response = responseBody;
    throw err;
  }

  // If in debug mode, inspect validationMessages
  if (isDebug && responseBody?.validationMessages?.length > 0) {
    const errorMessages = responseBody.validationMessages.map((m) => m.description).join('; ');
    const err = new Error(`GA4 MP validation failed: ${errorMessages}`);
    err.validationMessages = responseBody.validationMessages;
    err.response = responseBody;
    throw err;
  }

  return {
    success: true,
    response: responseBody || { status: response.status },
    isDebug,
  };
}
