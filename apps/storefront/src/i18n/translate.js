/**
 * Framework-free lookup + interpolation shared by server (`getT`) and client (`useT`).
 * Missing key → the key itself (visible in QA, never crashes; `npm run i18n:check` catches it in CI).
 */

/**
 * @param {object} dict
 * @param {string} key  'a.b.c'
 * @param {Record<string, string | number>} [vars]  replaces {{name}}
 */
export function translate(dict, key, vars) {
  const value = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
  if (typeof value !== 'string') return key;
  return vars
    ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
    : value;
}

/** Binds a dictionary: `const t = translator(dict); t('home.title', { store })`. */
export const translator = (dict) => (key, vars) => translate(dict, key, vars);

/** Top-level namespaces available to client components (keep small: shipped to the browser). */
export const CLIENT_NAMESPACES = Object.freeze(['notFound', 'error']);

/** Subset of a dictionary with the given top-level namespaces. */
export const pickNamespaces = (dict, namespaces = CLIENT_NAMESPACES) =>
  Object.fromEntries(namespaces.filter((ns) => ns in dict).map((ns) => [ns, dict[ns]]));
