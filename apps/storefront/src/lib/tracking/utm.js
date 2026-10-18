import { attributionSchema } from '@supershop/shared';

const STORAGE_KEY = 'supershop_attribution';

/**
 * Reads a specific cookie value by name from document.cookie safely.
 * @param {string} name
 * @returns {string | undefined}
 */
export function getCookie(name) {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Sets a cookie safely.
 * @param {string} name
 * @param {string} value
 * @param {number} [days=90]
 */
export function setCookie(name, value, days = 90) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Extracts marketing query parameters from URL or searchParams object.
 * @param {URLSearchParams | string | Record<string, string>} [search]
 * @returns {Record<string, string>}
 */
export function parseMarketingParams(search) {
  let target = search;
  if (!target) {
    if (typeof window === 'undefined') return {};
    target = window.location.search;
  }

  const params =
    typeof target === 'string'
      ? new URLSearchParams(target.startsWith('?') ? target.slice(1) : target)
      : target instanceof URLSearchParams
        ? target
        : new URLSearchParams(target);

  const captured = {};

  const paramMap = {
    utm_source: 'utmSource',
    utm_medium: 'utmMedium',
    utm_campaign: 'utmCampaign',
    utm_term: 'utmTerm',
    utm_content: 'utmContent',
    gclid: 'gclid',
    fbclid: 'fbclid',
    ttclid: 'ttclid',
    sclid: 'sclid',
  };

  for (const [queryKey, fieldName] of Object.entries(paramMap)) {
    const val = params.get ? params.get(queryKey) : params[queryKey];
    if (val && typeof val === 'string' && val.trim()) {
      captured[fieldName] = val.trim();
    }
  }

  return captured;
}

/**
 * Captures marketing query parameters into sessionStorage.
 * Also handles Meta _fbc generation if fbclid is present.
 * @param {URLSearchParams | string | Record<string, string>} [search]
 * @returns {Record<string, string>}
 */
export function captureAttribution(search) {
  if (typeof window === 'undefined') return {};

  const incoming = parseMarketingParams(search);
  const hasIncoming = Object.keys(incoming).length > 0;

  let existing = {};
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) existing = JSON.parse(stored);
  } catch {
    // ignore sessionStorage errors
  }

  if (incoming.fbclid && !getCookie('_fbc')) {
    const fbcVal = `fb.1.${Date.now()}.${incoming.fbclid}`;
    setCookie('_fbc', fbcVal, 90);
  }

  if (hasIncoming) {
    const merged = { ...existing, ...incoming };
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore sessionStorage errors
    }
    return merged;
  }

  return existing;
}

/**
 * Returns attribution payload for orders matching attributionSchema.
 * Returns undefined if no attribution data is present.
 * @returns {import('@supershop/shared').AttributionPayload | undefined}
 */
export function getAttributionPayload() {
  if (typeof window === 'undefined') return undefined;

  let stored = {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = {};
  }

  const fbp = getCookie('_fbp');
  const fbc = getCookie('_fbc');
  const clientUserAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

  const candidate = {
    ...stored,
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
    ...(clientUserAgent ? { clientUserAgent } : {}),
  };

  const parsed = attributionSchema.safeParse(candidate);
  if (!parsed.success) return undefined;

  const cleaned = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && v !== '') {
      cleaned[k] = v;
    }
  }

  // Only return if at least one UTM, click ID, or cookie exists (not just userAgent)
  const hasMarketingData = [
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'utmTerm',
    'utmContent',
    'gclid',
    'fbclid',
    'ttclid',
    'sclid',
    'fbp',
    'fbc',
  ].some((k) => cleaned[k]);

  return hasMarketingData ? cleaned : undefined;
}

/**
 * Clears stored attribution (e.g. after successful order if desired).
 */
export function clearAttribution() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setCookie('_fbc', '', -1);
    setCookie('_fbp', '', -1);
  } catch {
    // ignore
  }
}
