import qrcodeGenerator from 'qrcode-generator';

/**
 * QR Code: a boolean module matrix (true = dark) and an SVG renderer, both used by the screen and
 * by the ESC/POS builder, so a receipt's code and the one on the e-receipt page are the same code.
 *
 * The encoding itself comes from `qrcode-generator` (the reference JS implementation, no
 * dependencies of its own). An earlier hand-rolled encoder lived here and produced matrices no
 * scanner could read at all — the structure looked right, which is exactly why it went unnoticed
 * — so the generator is now a proven one, and `__tests__/qr.decode.test.js` decodes what we emit.
 *
 * It lives apart from `zatca.js` so the ESC/POS builder can measure a QR without the two files
 * importing each other.
 */

/** Error correction levels, strongest first. `H` recovers ~30% of a smudged or creased code. */
export const QR_LEVELS = ['H', 'Q', 'M', 'L'];

/** What a receipt prints with: the most robust level, which thermal paper and a phone both need. */
export const QR_DEFAULT_LEVEL = 'H';

const utf8 = new TextEncoder();

/**
 * Encodes a string into a square boolean matrix as a Model 2 QR Code.
 *
 * The payload is encoded as UTF-8 bytes (the library's own byte mode would truncate anything
 * above U+00FF), and the version is chosen automatically for the level.
 * @param {string} value
 * @param {{ level?: 'L'|'M'|'Q'|'H' }} [opts]
 * @returns {boolean[][]}
 */
export function qrMatrix(value, { level = QR_DEFAULT_LEVEL } = {}) {
  const text = String(value ?? '');
  const qr = qrcodeGenerator(0, QR_LEVELS.includes(level) ? level : QR_DEFAULT_LEVEL);
  // Hand it the bytes we mean, whatever the characters were.
  qr.addData([...utf8.encode(text)].map((b) => String.fromCharCode(b)).join(''), 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => qr.isDark(r, c)),
  );
}

/**
 * Renders a QR code as a standalone SVG string (for printable invoices and receipt previews).
 * Returns `''` when `value` is empty.
 *
 * @param {string} value
 * @param {{ size?: number, margin?: number }} [opts]
 * @returns {string}
 */
export function qrSvg(value, { size = 160, margin = 4 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const matrix = qrMatrix(text);
  const dim = matrix.length + margin * 2;
  // Whole pixels per module: a QR drawn on half a pixel is what a scanner gives up on.
  const crisp = Math.max(dim, Math.round(size / dim) * dim);
  let path = '';
  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c < matrix.length; c += 1) {
      if (matrix[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${crisp}" height="${crisp}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
