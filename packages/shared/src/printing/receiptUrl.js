/**
 * The public page for one sale, as it must be PRINTED on a receipt: the storefront serves its
 * default language (English) with no path prefix, so printing `/en/receipt/…` sends every scan
 * through a redirect. A phone also has to be able to REACH the host in the link — a QR holding
 * `localhost` decodes fine and then opens nothing — so the base comes from `STOREFRONT_URL` /
 * the `store.url` setting, which must be the address customers use.
 * @param {string} base  storefront origin, no trailing slash
 * @param {string} orderNo
 * @param {string} [lang]
 */
export const receiptUrl = (base, orderNo, lang = 'en') =>
  `${String(base).replace(/\/+$/, '')}${lang === 'ar' ? '/ar' : ''}/receipt/${encodeURIComponent(orderNo)}`;
