import { qrMatrix } from '@supershop/shared';

/**
 * QR Code as inline SVG using `qrMatrix` from `@supershop/shared` (ISO/IEC 18004 Model 2, ECC L).
 * Renders nothing when `value` is empty or exceeds the version capacity.
 * @param {{ value: string, size?: number, margin?: number, title?: string, className?: string }} props
 */
export function QrCode({ value, size = 128, margin = 2, title, className }) {
  let matrix;
  try {
    matrix = value ? qrMatrix(value) : null;
  } catch {
    matrix = null;
  }
  if (!matrix) return null;
  const total = matrix.size + margin * 2;
  const cells = [];
  for (let r = 0; r < matrix.size; r++) {
    let c = 0;
    while (c < matrix.size) {
      if (matrix.modules[r * matrix.size + c]) {
        const start = c;
        while (c < matrix.size && matrix.modules[r * matrix.size + c]) c++;
        cells.push({ x: start + margin, y: r + margin, w: c - start });
      } else {
        c++;
      }
    }
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
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
