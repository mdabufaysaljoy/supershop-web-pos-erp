import { normalizePhoneForTracking } from '@supershop/shared';
import { sha256 } from '../../../core/crypto.js';

/**
 * Google Ads Enhanced Conversions / Server GTM dispatch adapter.
 *
 * @param {object} params
 * @param {object} params.config Integration clientConfig (conversionId, conversionLabel, serverUrl)
 * @param {object} params.credentials Decrypted credentials
 * @param {object} params.payload Event payload (event, eventId, orderNumber, value, currency, customer, attribution)
 * @param {object} [params.options]
 * @param {typeof fetch} [params.options.fetchImpl] Custom fetch for testing
 * @returns {Promise<{ success: boolean, response: object }>}
 */
export async function dispatchGoogleAds({
  config = {},
  _credentials = {},
  payload = {},
  options = {},
}) {
  const conversionId = config.conversionId;
  const conversionLabel = config.conversionLabel;

  if (!conversionId || !conversionLabel) {
    throw new Error('Google Ads requires conversionId and conversionLabel in clientConfig');
  }

  const fetcher = options.fetchImpl || fetch;
  const customer = payload.customer || {};
  const attribution = payload.attribution || {};

  const userData = {};
  if (customer.email && typeof customer.email === 'string') {
    const cleanEmail = customer.email.trim().toLowerCase();
    if (cleanEmail) {
      userData.sha256_email_address = sha256(cleanEmail);
    }
  }

  if (customer.phone && typeof customer.phone === 'string') {
    const cleanPhone = normalizePhoneForTracking(customer.phone);
    if (cleanPhone) {
      userData.sha256_phone_number = sha256(cleanPhone);
    }
  }

  const conversionData = {
    conversion_id: conversionId,
    conversion_label: conversionLabel,
    transaction_id: payload.orderNumber || payload.eventId,
    currency: payload.currency || 'SAR',
    ...(typeof payload.value === 'number' && { value: payload.value }),
    ...(attribution.gclid && { gclid: attribution.gclid }),
    user_data: userData,
  };

  const serverUrl = config.serverUrl || options.serverUrl;

  if (serverUrl) {
    const response = await fetcher(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversionData),
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
        responseBody?.error?.message || `Google Ads dispatch failed with HTTP ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.response = responseBody;
      throw err;
    }

    return {
      success: true,
      response: responseBody || { status: response.status },
    };
  }

  // Without direct serverUrl, records the fully processed payload ready for GTM server container
  return {
    success: true,
    response: {
      status: 200,
      message: 'Enhanced conversion payload processed',
      conversionData,
    },
  };
}
