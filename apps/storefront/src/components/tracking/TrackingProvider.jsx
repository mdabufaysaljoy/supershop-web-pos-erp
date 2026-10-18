'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  captureAttribution,
  getAttributionPayload,
  getStoredConsent,
  initConsentMode,
  pushDataLayerEvent,
  saveConsent,
  trackPageView,
} from '@/lib/tracking';
import { ConsentBanner } from './ConsentBanner';

const TrackingContext = createContext(null);

function AttributionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathname = useRef(null);

  useEffect(() => {
    if (searchParams) {
      captureAttribution(searchParams);
    }

    // Only fire page_view when pathname changes
    if (pathname && pathname !== lastPathname.current) {
      lastPathname.current = pathname;
      trackPageView({ path: pathname });
    }
  }, [pathname, searchParams]);

  return null;
}

/**
 * Root tracking provider:
 * - Initializes Google Consent Mode v2 & PDPL consent
 * - Dynamically loads enabled tracking tags (GTM, Meta, GA4)
 * - Captures UTM params and click IDs on route transitions
 * - Pushes page_view events on navigation
 * - Renders PDPL ConsentBanner
 */
export function TrackingProvider({ initialData, children }) {
  const integrations = useMemo(() => initialData?.integrations || [], [initialData?.integrations]);
  const consentConfig = useMemo(
    () => initialData?.consent || { enabled: false },
    [initialData?.consent],
  );

  const [consent, setConsent] = useState(() => getStoredConsent());
  const [isBannerOpen, setIsBannerOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = getStoredConsent();
      const dismissed = window.localStorage.getItem('pdpl_consent_dismissed') === 'true';
      return Boolean(consentConfig.enabled && stored === null && !dismissed);
    } catch {
      return false;
    }
  });

  // 1. Initialize Google Consent Mode v2 immediately
  useEffect(() => {
    initConsentMode(consentConfig);
  }, [consentConfig]);

  // 2. Load provider scripts if enabled
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Google Tag Manager
    const gtm = integrations.find(
      (i) => i.provider === 'gtm' && i.enabled && i.clientConfig?.containerId,
    );
    if (gtm?.clientConfig?.containerId) {
      const id = gtm.clientConfig.containerId;
      if (!document.getElementById(`gtm-script-${id}`)) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
        const script = document.createElement('script');
        script.id = `gtm-script-${id}`;
        script.async = true;
        const gtmUrl = gtm.clientConfig.serverUrl
          ? `${gtm.clientConfig.serverUrl.replace(/\/$/, '')}/gtm.js?id=${encodeURIComponent(id)}`
          : `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
        script.src = gtmUrl;
        document.head.appendChild(script);
      }
    }

    // Google Analytics 4 (if not handled through GTM)
    const ga4 = integrations.find(
      (i) => i.provider === 'ga4' && i.enabled && i.clientConfig?.measurementId,
    );
    if (ga4?.clientConfig?.measurementId && !gtm) {
      const mid = ga4.clientConfig.measurementId;
      if (!document.getElementById(`ga4-script-${mid}`)) {
        const script = document.createElement('script');
        script.id = `ga4-script-${mid}`;
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(mid)}`;
        document.head.appendChild(script);
      }
    }

    // Meta Pixel (if not handled through GTM)
    const meta = integrations.find(
      (i) => i.provider === 'meta' && i.enabled && i.clientConfig?.pixelId,
    );
    if (meta?.clientConfig?.pixelId && !gtm) {
      const pid = meta.clientConfig.pixelId;
      if (!window.fbq) {
        const fbq = function () {
          if (fbq.callMethod) {
            fbq.callMethod.apply(fbq, arguments);
          } else {
            fbq.queue.push(arguments);
          }
        };
        if (!window._fbq) window._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];
        window.fbq = fbq;

        const script = document.createElement('script');
        script.id = 'meta-pixel-script';
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        document.head.appendChild(script);
        window.fbq('init', pid);
      }
    }
  }, [integrations]);

  const handleUpdateConsent = useCallback((newChoice) => {
    const saved = saveConsent(newChoice);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('pdpl_consent_dismissed', 'true');
      } catch {
        // ignore
      }
    }
    setConsent(saved);
    setIsBannerOpen(false);
  }, []);

  const openConsentBanner = useCallback(() => {
    setIsBannerOpen(true);
  }, []);

  const contextValue = useMemo(
    () => ({
      track: pushDataLayerEvent,
      consent,
      updateConsent: handleUpdateConsent,
      openConsentBanner,
      getAttribution: getAttributionPayload,
      integrations,
      consentConfig,
    }),
    [consent, handleUpdateConsent, openConsentBanner, integrations, consentConfig],
  );

  return (
    <TrackingContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <AttributionTracker />
      </Suspense>
      {children}
      {consentConfig.enabled && (
        <ConsentBanner
          config={consentConfig}
          consent={consent}
          onSave={handleUpdateConsent}
          isOpen={isBannerOpen}
          onClose={() => setIsBannerOpen(false)}
        />
      )}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) {
    // Return a safe fallback outside TrackingProvider
    return {
      track: pushDataLayerEvent,
      consent: null,
      updateConsent: () => {},
      openConsentBanner: () => {},
      getAttribution: getAttributionPayload,
      integrations: [],
      consentConfig: {},
    };
  }
  return ctx;
}
