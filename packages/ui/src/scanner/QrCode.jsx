import { qrMatrix } from '@supershop/shared';

/**
 * QR Code as inline SVG using `qrMatrix` from `@supershop/shared` (ISO/IEC 18004 Model 2, ECC L).
 * Renders nothing when `value` is empty or exceeds the version capacity.
 * @param {{ value: string, size?: number, margin?: number, title?: string, className?: string }} props
 */
export function QrCode({ value, size = 128, margin = 4, title, className }) {
  let matrix;
  try {
    matrix = value ? qrMatrix(value) : null;
  } catch {
    matrix = null;
  }
  if (!matrix) return null;
  const dim = matrix.length ?? matrix.size;
  if (!dim) return null;
  const total = dim + margin * 2;
  /**
   * A whole number of pixels per module, or the grid lands on half pixels and the code prints and
   * scans as a grey blur. The drawn size is rounded to the nearest multiple instead of the size
   * asked for — never below one pixel a module.
   */
  const scale = Math.max(1, Math.round(size / total));
  const drawn = scale * total;
  const cells = [];
  if (Array.isArray(matrix[0])) {
    for (let r = 0; r < dim; r++) {
      let c = 0;
      while (c < dim) {
        if (matrix[r][c]) {
          const start = c;
          while (c < dim && matrix[r][c]) c++;
          cells.push({ x: start + margin, y: r + margin, w: c - start });
        } else {
          c++;
        }
      }
    }
  } else if (matrix.modules) {
    for (let r = 0; r < dim; r++) {
      let c = 0;
      while (c < dim) {
        if (matrix.modules[r * dim + c]) {
          const start = c;
          while (c < dim && matrix.modules[r * dim + c]) c++;
          cells.push({ x: start + margin, y: r + margin, w: c - start });
        } else {
          c++;
        }
      }
    }
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} ${total}`}
      width={drawn}
      height={drawn}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? 'QR code'}
      className={className}
    >
      <rect width={total} height={total} fill="#fff" />
      <g fill="#000">
        {cells.map((cell) => (
          <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={cell.w} height={1} />
        ))}
      </g>
    </svg>
  );
}
