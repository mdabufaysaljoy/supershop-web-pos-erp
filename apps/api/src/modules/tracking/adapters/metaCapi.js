import { META_EVENT_MAP, normalizePhoneForTracking } from '@supershop/shared';
import { sha256 } from '../../../core/crypto.js';

/**
 * Meta Conversions API (CAPI) adapter.
 * Sends server-side conversion events to Meta Graph API v19.0.
 *
 * @param {object} params
 * @param {object} params.config Integration clientConfig (pixelId, testEventCode)
 * @param {object} params.credentials Decrypted credentials (capiToken)
 * @param {object} params.payload Event payload (event, eventId, orderNumber, value, currency, items, customer, attribution)
 * @param {object} [params.options]
 * @param {typeof fetch} [params.options.fetchImpl] Custom fetch for testing
 * @returns {Promise<{ success: boolean, response: object, eventsReceived?: number }>}
 */
export async function dispatchMetaCapi({
  config = {},
  credentials = {},
  payload = {},
  options = {},
}) {
  const pixelId = config.pixelId;
  const capiToken = credentials.capiToken;

  if (!pixelId || !capiToken) {
    throw new Error('Meta CAPI requires pixelId in config and capiToken in credentials');
  }

  const fetcher = options.fetchImpl || fetch;
  const eventName = META_EVENT_MAP[payload.event] || payload.event;

  // Prepare normalized and hashed user data
  const userData = {};
  const customer = payload.customer || {};
  const attribution = payload.attribution || {};

  if (customer.email && typeof customer.email === 'string') {
    const cleanEmail = customer.email.trim().toLowerCase();
    if (cleanEmail) {
      userData.em = [sha256(cleanEmail)];
    }
  }

  if (customer.phone && typeof customer.phone === 'string') {
    const cleanPhone = normalizePhoneForTracking(customer.phone);
    if (cleanPhone) {
      userData.ph = [sha256(cleanPhone)];
    }
  }

  let firstName = customer.firstName;
  let lastName = customer.lastName;
  if (!firstName && customer.name && typeof customer.name === 'string') {
    const parts = customer.name.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ') || undefined;
  }

  if (firstName && typeof firstName === 'string') {
    userData.fn = [sha256(firstName.trim().toLowerCase())];
  }
  if (lastName && typeof lastName === 'string') {
    userData.ln = [sha256(lastName.trim().toLowerCase())];
  }

  if (attribution.fbp) userData.fbp = attribution.fbp;
  if (attribution.fbc) userData.fbc = attribution.fbc;
  if (attribution.clientIpAddress) userData.client_ip_address = attribution.clientIpAddress;
  if (attribution.clientUserAgent) userData.client_user_agent = attribution.clientUserAgent;

  // Custom data
  const customData = {
    currency: payload.currency || 'SAR',
    content_type: 'product',
  };

  if (typeof payload.value === 'number') {
    customData.value = payload.value;
  }
  if (payload.orderNumber) {
    customData.order_id = payload.orderNumber;
  }

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    customData.contents = payload.items.map((i) => ({
      id: String(i.item_id || i.sku || i.id || ''),
      quantity: Number(i.quantity) || 1,
      ...(typeof i.price === 'number' && { item_price: i.price }),
    }));
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const eventData = {
    event_name: eventName,
    event_time: eventTime,
    event_id: payload.eventId,
    action_source: 'website',
    user_data: userData,
    custom_data: customData,
    ...(attribution.landingPage && { event_source_url: attribution.landingPage }),
  };

  const testEventCode = payload.testEventCode || config.testEventCode || options.testEventCode;

  const requestBody = {
    data: [eventData],
    ...(testEventCode && { test_event_code: testEventCode }),
  };

  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(capiToken)}`;

  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      responseBody?.error?.message || `Meta CAPI request failed with HTTP ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.response = responseBody;
    throw err;
  }

  return {
    success: true,
    response: responseBody,
    eventsReceived: responseBody?.events_received ?? 1,
  };
}
