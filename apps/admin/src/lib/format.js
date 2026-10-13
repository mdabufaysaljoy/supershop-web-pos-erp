import { createFormatters } from '@supershop/shared';

/**
 * Admin display formatting (admin UI is English in v1; times in the default store time zone).
 */
export const fmt = createFormatters({ lang: 'en' });

/** 1536 → "1.5 kB" (decimal units, like file managers). */
export function formatBytes(bytes) {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];
  let value = bytes;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i += 1;
  }
  return fmt.number(value, {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'short',
    maximumFractionDigits: i === 0 ? 0 : 1,
  });
}
