import localFont from 'next/font/local';

/**
 * Self-hosted fonts (OFL 1.1, from Fontsource 5.3.0 — licenses alongside). No request to Google at
 * build or run time (deterministic builds, visitor privacy / PDPL).
 *
 * - Inter (Latin) is preloaded: every page has Latin text.
 * - Noto Sans Arabic is NOT preloaded and is limited by `unicode-range` to Arabic code points, so
 *   English pages never download it; Arabic pages fetch it on first Arabic glyph (swap avoids
 *   invisible text). Both are variable fonts: one file covers all weights.
 */
export const latinFont = localFont({
  src: './inter-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-latin',
  preload: true,
});

export const arabicFont = localFont({
  src: './noto-sans-arabic-arabic-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-arabic',
  preload: false,
  declarations: [
    // Arabic, Arabic Supplement, Arabic Presentation Forms A/B, ZWNJ/ZWJ, RLM/LRM.
    {
      prop: 'unicode-range',
      value: 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F',
    },
  ],
});
