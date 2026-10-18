import { dispatchGa4Mp } from './ga4MeasurementProtocol.js';
import { dispatchGoogleAds } from './googleAdsEnhanced.js';
import { dispatchMetaCapi } from './metaCapi.js';

export const trackingAdapters = Object.freeze({
  meta: dispatchMetaCapi,
  ga4: dispatchGa4Mp,
  google_ads: dispatchGoogleAds,
});

/**
 * Returns adapter dispatcher for a given provider.
 * @param {string} provider
 * @returns {Function|null}
 */
export function getAdapter(provider) {
  return trackingAdapters[provider] || null;
}
