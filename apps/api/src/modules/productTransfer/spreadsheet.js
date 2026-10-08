import ExcelJS from 'exceljs';
import { parseCsv, toCsv, unneutralize } from './csv.js';

/**
 * Tabular files for import/export: CSV (UTF-8) and XLSX. The real format is detected from the
 * bytes (XLSX = ZIP), never from the file name. Every cell is read as a string.
 */

export const FORMATS = Object.freeze({
  csv: { contentType: 'text/csv; charset=utf-8', ext: 'csv' },
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
});

export class UnsupportedFileError extends Error {}

/** 'xlsx' | 'csv' from magic bytes, or null. */
export function detectFormat(buf) {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return 'xlsx';
  }
  // Text: valid UTF-8 without NUL bytes.
  if (buf.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return 'csv';
  } catch {
    return null;
  }
}

const pad = (n) => String(n).padStart(2, '0');
/** Excel cell value → string (dates as YYYY-MM-DD, formulas as their cached result). */
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date)
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
    return '';
  }
  return String(v);
}

/**
 * @param {Buffer} buf
 * @param {{ maxRows: number, maxColumns: number }} limits
 * @returns {Promise<{ format: 'csv' | 'xlsx', headers: string[], rows: { line: number, cells: string[] }[] }>}
 */
export async function readTable(buf, { maxRows, maxColumns }) {
  const format = detectFormat(buf);
  if (!format) throw new UnsupportedFileError('Not a CSV or XLSX file');
  let records;
  if (format === 'csv') {
    records = parseCsv(buf.toString('utf8'));
  } else {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf);
    } catch (err) {
      throw new UnsupportedFileError('Unreadable XLSX file', { cause: err });
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new UnsupportedFileError('The workbook has no sheets');
    if (ws.rowCount > maxRows + 1) throw new RangeError('too many rows');
    records = [];
    ws.eachRow({ includeEmpty: false }, (row, line) => {
      const cells = [];
      for (let c = 1; c <= Math.min(row.cellCount, maxColumns); c += 1)
        cells.push(cellText(row.getCell(c).value));
      records.push({ line, cells });
    });
  }
  if (!records.length) return { format, headers: [], rows: [] };
  if (records.length - 1 > maxRows) throw new RangeError('too many rows');
  const [head, ...rest] = records;
  const headers = head.cells.slice(0, maxColumns).map((h) => h.trim().toLowerCase());
  const rows = rest
    .map((r) => ({ line: r.line, cells: r.cells.slice(0, maxColumns).map((c) => unneutralize(c)) }))
    .filter((r) => r.cells.some((c) => c.trim() !== ''));
  return { format, headers, rows };
}

/**
 * @param {'csv' | 'xlsx'} format
 * @param {string[]} headers
 * @param {(string | number | null)[][]} rows
 * @param {{ sheetName?: string, notes?: [string, string][] }} [opts] `notes`: extra "Instructions" sheet (xlsx)
 * @returns {Promise<Buffer>}
 */
export async function writeTable(format, headers, rows, { sheetName = 'Products', notes } = {}) {
  if (format === 'csv') return Buffer.from(toCsv([headers, ...rows]), 'utf8');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers).font = { bold: true };
  // Strings are written as plain text cells (never formulas), so no formula neutralizing needed.
  for (const r of rows) ws.addRow(r.map((v) => (v == null ? '' : v)));
  ws.columns.forEach((col, i) => {
    col.width = Math.min(40, Math.max(12, headers[i]?.length ?? 12) + 2);
  });
  if (notes?.length) {
    const info = wb.addWorksheet('Instructions');
    info.addRow(['Column', 'How to fill it']).font = { bold: true };
    notes.forEach((n) => info.addRow(n));
    info.getColumn(1).width = 24;
    info.getColumn(2).width = 100;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
