import { describe, expect, it } from 'vitest';
import { createFormatters } from '../format.js';

const d = new Date(Date.UTC(2026, 9, 8, 21, 30)); // 9 Oct 2026 00:30 in Riyadh (UTC+3)

describe('createFormatters', () => {
  it('English: Western digits, SAR, store time zone', () => {
    const f = createFormatters({ lang: 'en' });
    expect(f.money(123456)).toMatch(/SAR\s?1,234\.56/);
    expect(f.number(1234567)).toBe('1,234,567');
    expect(f.percent(0.15)).toBe('15%');
    expect(f.date(d)).toMatch(/9 October 2026|October 9, 2026/); // Riyadh date, not UTC (8th)
  });

  it('Arabic with Western digits (default) — never Arabic-Indic', () => {
    const f = createFormatters({ lang: 'ar' });
    expect(f.money(123456)).toMatch(/1,234\.56/);
    expect(f.money(123456)).not.toMatch(/[٠-٩]/);
    expect(f.plain(2026)).toBe('2026');
  });

  it('Arabic with Arabic-Indic digits when configured', () => {
    const f = createFormatters({ lang: 'ar', digits: 'arab' });
    expect(f.plain(2026)).toBe('٢٠٢٦');
    expect(f.money(150)).toMatch(/١٫٥٠/);
  });

  it('digit setting never affects English', () => {
    expect(createFormatters({ lang: 'en', digits: 'arab' }).plain(2026)).toBe('2026');
  });

  it('calendar is explicit: Gregorian by default even for ar-SA; Hijri / both on request', () => {
    const greg = createFormatters({ lang: 'ar' }).date(d);
    expect(greg).toMatch(/2026/);
    const hijri = createFormatters({ lang: 'ar', calendar: 'hijri' }).date(d);
    expect(hijri).toMatch(/1448/); // Hijri year for Oct 2026
    expect(hijri).not.toMatch(/2026/);
    const both = createFormatters({ lang: 'en', calendar: 'both' }).date(d);
    expect(both).toMatch(/2026.*\(.*1448.*\)/);
  });

  it('rejects non-integer money (minor units only)', () => {
    expect(() => createFormatters({ lang: 'en' }).money(12.5)).toThrow(TypeError);
  });
});
