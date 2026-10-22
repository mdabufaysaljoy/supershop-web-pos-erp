/**
 * Theme tokens (P5.4): the few things a shop may change about how its site looks, as DATA.
 * They map onto the CSS variables the storefront already uses, so nothing has to be restyled —
 * the layout prints them on `<html>` and every component follows.
 *
 * Fonts are the ones the app ships with (self-hosted, D-078): a shop chooses between them, it
 * cannot point the site at a font that would be fetched from somewhere else.
 */
export const THEME = Object.freeze({
  RADII: Object.freeze(['none', 'sm', 'md', 'lg', 'full']),
  FONTS: Object.freeze(['bundled', 'system']),
  DEFAULTS: Object.freeze({
    primary: '#1f1f1f',
    primaryForeground: '#fafafa',
    /** The quieter half of the pair: chips, soft buttons, the background of a highlighted row. */
    secondary: '#f1f5f9',
    secondaryForeground: '#1f1f1f',
    radius: 'md',
    font: 'bundled',
  }),
});

const RADIUS_REM = Object.freeze({
  none: '0rem',
  sm: '0.375rem',
  md: '0.625rem',
  lg: '1rem',
  full: '2rem',
});

const FONT_STACK = Object.freeze({
  bundled:
    "var(--font-latin), var(--font-arabic), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Tahoma, sans-serif",
  system: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Tahoma, sans-serif",
});

/** `#RGB`/`#RRGGBB` only — a token goes straight into a stylesheet, so nothing else is accepted. */
export const isHexColor = (value) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value ?? ''));

/**
 * The CSS custom properties for a theme, ready for a `style` attribute or a stylesheet.
 * Unknown or malformed values fall back to the default rather than writing nonsense into CSS.
 * @param {object} [theme]
 * @returns {Record<string, string>}
 */
export function themeCssVars(theme = {}) {
  const t = { ...THEME.DEFAULTS, ...theme };
  const color = (value, fallback) => (isHexColor(value) ? value.toLowerCase() : fallback);
  return {
    '--primary': color(t.primary, THEME.DEFAULTS.primary),
    '--primary-foreground': color(t.primaryForeground, THEME.DEFAULTS.primaryForeground),
    '--secondary': color(t.secondary, THEME.DEFAULTS.secondary),
    '--secondary-foreground': color(t.secondaryForeground, THEME.DEFAULTS.secondaryForeground),
    // The soft surface a theme reads as "the other colour" — kept in step with secondary.
    '--accent': color(t.secondary, THEME.DEFAULTS.secondary),
    '--accent-foreground': color(t.secondaryForeground, THEME.DEFAULTS.secondaryForeground),
    '--ring': color(t.primary, THEME.DEFAULTS.primary),
    '--radius': RADIUS_REM[t.radius] ?? RADIUS_REM[THEME.DEFAULTS.radius],
    '--font-sans': FONT_STACK[t.font] ?? FONT_STACK.bundled,
  };
}
