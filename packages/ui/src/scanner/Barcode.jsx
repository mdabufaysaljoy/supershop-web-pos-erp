import { barRuns, encodeBarcode } from '@supershop/shared';

/**
 * Barcode as inline SVG (EAN-13/EAN-8/UPC-A when the code is a valid GTIN, else Code 128).
 * Renders nothing for codes that can't be encoded. Sizes in px; `moduleWidth` ≥ 1 for screens.
 * @param {{ value: string, height?: number, moduleWidth?: number, showText?: boolean,
 *   title?: string, className?: string }} props
 */
export function Barcode({
  value,
  height = 64,
  moduleWidth = 2,
  showText = true,
  title,
  className,
}) {
  let encoded;
  try {
    encoded = value ? encodeBarcode(value) : null;
  } catch {
    encoded = null;
  }
  if (!encoded) return null;
  const quiet = 10;
  const width = (encoded.modules.length + quiet * 2) * moduleWidth;
  const textHeight = showText ? 18 : 0;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height + textHeight}`}
      width={width}
      height={height + textHeight}
      role="img"
      aria-label={title ?? value}
      className={className}
      data-symbology={encoded.type}
    >
      <rect width="100%" height="100%" fill="#fff" />
      <g fill="#000">
        {barRuns(encoded.modules).map((r) => (
          <rect
            key={r.x}
            x={(r.x + quiet) * moduleWidth}
            y={0}
            width={r.width * moduleWidth}
            height={height}
          />
        ))}
      </g>
      {showText && (
        <text
          x={width / 2}
          y={height + 15}
          fontFamily="monospace"
          fontSize="14"
          textAnchor="middle"
          fill="#000"
        >
          {value}
        </text>
      )}
    </svg>
  );
}
