import { getCookie, setCookie } from './utm';

const CONSENT_STORAGE_KEY = 'pdpl_consent_v1';
const CONSENT_COOKIE_KEY = 'pdpl_consent';

/**
 * Ensures gtag function exists on window and attaches to window.dataLayer.
 */
export function ensureGtag() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

/**
 * Gets stored user consent from localStorage or cookie.
 * @returns {{ necessary: boolean, analytics: boolean, marketing: boolean, timestamp: string } | null}
 */
export function getStoredConsent() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.analytics === 'boolean' && typeof parsed.marketing === 'boolean') {
        return {
          necessary: true,
          analytics: parsed.analytics,
          marketing: parsed.marketing,
          timestamp: parsed.timestamp || new Date().toISOString(),
        };
      }
    }
  } catch {
    // fallback to cookie if localStorage unavailable
  }

  const cookieVal = getCookie(CONSENT_COOKIE_KEY);
  if (cookieVal) {
    try {
      const parsed = JSON.parse(cookieVal);
      return {
        necessary: true,
        analytics: Boolean(parsed.a),
        marketing: Boolean(parsed.m),
        timestamp: parsed.t || new Date().toISOString(),
      };
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Checks whether user has explicitly submitted a consent decision.
 * @returns {boolean}
 */
export function hasUserConsented() {
  return getStoredConsent() !== null;
}

/**
 * Saves user consent choice to localStorage, cookie, and updates Google Consent Mode.
 * @param {{ analytics: boolean, marketing: boolean }} choice
 */
export function saveConsent({ analytics, marketing }) {
  if (typeof window === 'undefined') return;

  const payload = {
    necessary: true,
    analytics: Boolean(analytics),
    marketing: Boolean(marketing),
    timestamp: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }

  try {
    setCookie(
      CONSENT_COOKIE_KEY,
      JSON.stringify({
        a: payload.analytics ? 1 : 0,
        m: payload.marketing ? 1 : 0,
        t: payload.timestamp,
      }),
      365,
    );
  } catch {
    // ignore
  }

  updateConsentMode(payload);
  return payload;
}

/**
 * Initializes Google Consent Mode v2 default settings.
 * @param {{ consentModeV2?: boolean, defaultAnalytics?: boolean, defaultMarketing?: boolean }} [config]
 */
export function initConsentMode(config = {}) {
  if (typeof window === 'undefined') return;

  ensureGtag();

  if (config.consentModeV2 === false) return;

  const existing = getStoredConsent();

  if (existing) {
    // User already consented in a previous session
    window.gtag('consent', 'default', {
      analytics_storage: existing.analytics ? 'granted' : 'denied',
      ad_storage: existing.marketing ? 'granted' : 'denied',
      ad_user_data: existing.marketing ? 'granted' : 'denied',
      ad_personalization: existing.marketing ? 'granted' : 'denied',
    });
  } else {
    // Default prior to explicit user consent: deny non-essential with wait_for_update
    window.gtag('consent', 'default', {
      analytics_storage: config.defaultAnalytics ? 'granted' : 'denied',
      ad_storage: config.defaultMarketing ? 'granted' : 'denied',
      ad_user_data: config.defaultMarketing ? 'granted' : 'denied',
      ad_personalization: config.defaultMarketing ? 'granted' : 'denied',
      wait_for_update: 500,
    });
  }
}

/**
 * Updates Google Consent Mode v2 dynamically when user grants or denies consent.
 * @param {{ analytics: boolean, marketing: boolean }} consent
 */
export function updateConsentMode(consent) {
  if (typeof window === 'undefined') return;

  ensureGtag();

  window.gtag('consent', 'update', {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: consent.marketing ? 'granted' : 'denied',
    ad_user_data: consent.marketing ? 'granted' : 'denied',
    ad_personalization: consent.marketing ? 'granted' : 'denied',
  });
}
