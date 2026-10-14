/**
 * Redirects (P5.5): the shop's own "this moved there" list. A redirect is stored for the
 * LANGUAGE-NEUTRAL path (`/old-offer`, never `/ar/old-offer`), so one rule covers every language
 * and the visitor stays in theirs.
 */
export const REDIRECT_STATUSES = Object.freeze([301, 302, 410]);

/** `/Old-Offer/?utm=x` → `/old-offer`. Query and trailing slash never decide a match. */
export function normalizeRedirectPath(path) {
  const [withoutQuery = ''] = String(path ?? '').split(/[?#]/);
  const trimmed = withoutQuery.trim().replace(/\/+$/, '').toLowerCase();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Strips a language prefix: `['/ar/offers', 'ar']` ← `/ar/offers`. */
export function splitLangPrefix(path, locales = []) {
  const match = locales.find((l) => path === `/${l}` || path.startsWith(`/${l}/`));
  if (!match) return { lang: null, path: path || '/' };
  return { lang: match, path: path.slice(match.length + 1) || '/' };
}

/**
 * The rule for a requested path, if any — matched on the language-neutral path. The answer says
 * where to send the visitor IN THEIR LANGUAGE (`/ar/...` for an internal target), or that the
 * page is gone (410).
 *
 * @param {{ from: string, to: string, status: number }[]} rules
 * @param {string} requestPath  as asked for, language prefix and query included
 * @param {{ locales?: string[], defaultLocale?: string }} [opts]
 * @returns {null | { status: number, to: string | null }}
 */
export function matchRedirect(rules, requestPath, { locales = [], defaultLocale = 'en' } = {}) {
  const [pathname = '', query = ''] = String(requestPath ?? '').split('?');
  const { lang, path } = splitLangPrefix(pathname, locales);
  const wanted = normalizeRedirectPath(path);
  const rule = (rules ?? []).find((r) => normalizeRedirectPath(r.from) === wanted);
  if (!rule) return null;
  if (rule.status === 410) return { status: 410, to: null };

  const internal = rule.to.startsWith('/');
  const inLanguage =
    internal && lang && lang !== defaultLocale
      ? `/${lang}${rule.to === '/' ? '' : rule.to}`
      : rule.to;
  return { status: rule.status, to: query && internal ? `${inLanguage}?${query}` : inLanguage };
}

/**
 * robots.txt as data: what the shop wants plus the areas that are never indexable.
 * A shop that switches indexing OFF (a staging copy, a site not ready) gets a blanket disallow —
 * there is deliberately no way to disallow only some crawlers from the admin.
 *
 * @param {{ indexable?: boolean, extra?: string, privatePaths?: string[], locales?: string[] }} opts
 * @returns {{ rules: { userAgent: string, allow?: string, disallow: string[] }, extraLines: string[] }}
 */
export function robotsPolicy({ indexable = true, extra = '', privatePaths = [], locales = [] }) {
  const disallow = indexable
    ? [...privatePaths, ...locales.flatMap((l) => privatePaths.map((p) => `/${l}${p}`))]
    : ['/'];
  return {
    rules: { userAgent: '*', ...(indexable && { allow: '/' }), disallow },
    // Lines the shop added itself (one directive per line, comments kept, blanks dropped).
    extraLines: String(extra ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

/**
 * The robots.txt file itself. Rendered here (not from a framework's metadata object) because a
 * shop may add its OWN lines, and those have to come out verbatim.
 *
 * @param {ReturnType<typeof robotsPolicy>} policy
 * @param {{ sitemap?: string | null }} [opts]
 */
export function robotsTxt(policy, { sitemap = null } = {}) {
  const lines = [`User-agent: ${policy.rules.userAgent}`];
  if (policy.rules.allow) lines.push(`Allow: ${policy.rules.allow}`);
  for (const path of policy.rules.disallow) lines.push(`Disallow: ${path}`);
  if (policy.extraLines.length) lines.push('', ...policy.extraLines);
  if (sitemap) lines.push('', `Sitemap: ${sitemap}`);
  return `${lines.join('\n')}\n`;
}
