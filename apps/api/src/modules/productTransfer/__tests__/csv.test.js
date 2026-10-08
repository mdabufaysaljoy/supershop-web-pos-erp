import { describe, expect, it } from 'vitest';
import { CsvError, neutralizeFormula, parseCsv, toCsv, unneutralize } from '../csv.js';

const cells = (text) => parseCsv(text).map((r) => r.cells);

describe('CSV', () => {
  it('parses quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM', () => {
    const text =
      '﻿sku,name,description\r\n"A-1","Shirt, ""Slim""","Line 1\nLine 2"\r\nB-2,Rice,\r\n\r\n';
    expect(cells(text)).toEqual([
      ['sku', 'name', 'description'],
      ['A-1', 'Shirt, "Slim"', 'Line 1\nLine 2'],
      ['B-2', 'Rice', ''],
    ]);
    expect(parseCsv(text).map((r) => r.line)).toEqual([1, 2, 4]);
  });

  it('detects ; and tab delimiters (Excel regional settings)', () => {
    expect(cells('sku;price\nA;1,50')).toEqual([
      ['sku', 'price'],
      ['A', '1,50'],
    ]);
    expect(cells('sku\tprice\nA\t2')).toEqual([
      ['sku', 'price'],
      ['A', '2'],
    ]);
  });

  it('reports an unclosed quote with its line', () => {
    expect(() => parseCsv('a,b\n"x,y\n')).toThrow(CsvError);
  });

  it('writes with BOM + CRLF, round-trips Arabic and neutralizes formulas', () => {
    const rows = [
      ['name', 'note', 'n'],
      ['قميص', '=HYPERLINK("x")', '-12.5'],
      ['a"b', ' padded ', '@cmd'],
    ];
    const out = toCsv(rows);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toContain('\r\n');
    const back = cells(out).map((r) => r.map(unneutralize));
    expect(back).toEqual(rows);
    expect(neutralizeFormula('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(neutralizeFormula('-5')).toBe('-5');
  });
});
