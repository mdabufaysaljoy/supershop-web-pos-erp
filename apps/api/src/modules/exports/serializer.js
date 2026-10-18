import ExcelJS from 'exceljs';

export const EXPORT_MIME_TYPES = Object.freeze({
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json; charset=utf-8',
});

/**
 * Formula injection protection (OWASP CSV Injection).
 * Any cell value starting with =, +, -, @, \t, or \r is prefixed with a single quote.
 * Pure numbers (e.g. -12.5) are left unchanged.
 */
export function neutralizeFormula(value) {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function quoteCsvCell(value) {
  const safe = value == null ? '' : String(neutralizeFormula(value));
  return /[",\r\n;]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsvString(headers, rows) {
  const headerLine = headers.map(quoteCsvCell).join(',');
  const rowLines = rows.map((r) => r.map(quoteCsvCell).join(','));
  return `\uFEFF${[headerLine, ...rowLines].join('\r\n')}\r\n`;
}

/**
 * Formats a raw cell value according to its column type.
 * e.g. money (halalas) to formatted SAR string or decimal.
 */
export function formatCellValue(value, type) {
  if (value == null) return '';
  if (type === 'money') {
    const num = Number(value);
    return isNaN(num) ? '0.00' : (num / 100).toFixed(2);
  }
  if (type === 'date') {
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 19);
  }
  if (type === 'number') {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

/**
 * Serializes headers and tabular rows into a binary Buffer of the requested format.
 *
 * @param {'xlsx' | 'csv' | 'json'} format
 * @param {string[]} headers Array of header labels (e.g. ["Order Number", "Total (SAR)"])
 * @param {string[]} keys Array of raw keys (e.g. ["orderNo", "total"])
 * @param {any[][]} rows Array of row arrays matching headers length
 * @param {{ title?: string, sheetName?: string }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function serializeExport({ format, headers, keys, rows, title = 'Export' }) {
  if (format === 'csv') {
    return Buffer.from(toCsvString(headers, rows), 'utf8');
  }

  if (format === 'json') {
    const objects = rows.map((row) => {
      const obj = {};
      const idKeys = keys && keys.length === headers.length ? keys : headers;
      for (let i = 0; i < idKeys.length; i += 1) {
        obj[idKeys[i]] = row[i];
      }
      return obj;
    });
    return Buffer.from(JSON.stringify(objects, null, 2), 'utf8');
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Antigravity SuperShop POS & ERP';
    wb.created = new Date();

    const sheetName = String(title || 'Export').slice(0, 31);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Add and style header row
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FF111827' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };
    headerRow.height = 24;
    headerRow.alignment = { vertical: 'middle' };

    // Add data rows with neutralized values
    for (const row of rows) {
      const sanitizedRow = row.map((cell) => neutralizeFormula(cell));
      const r = ws.addRow(sanitizedRow);
      r.height = 20;
      r.alignment = { vertical: 'middle' };
    }

    // Auto-fit column widths (min 12, max 45)
    ws.columns.forEach((col, idx) => {
      const headerLength = headers[idx] ? String(headers[idx]).length : 10;
      let maxLength = headerLength;
      const sampleSize = Math.min(rows.length, 50);
      for (let i = 0; i < sampleSize; i += 1) {
        const cellVal = rows[i]?.[idx];
        if (cellVal != null) {
          const l = String(cellVal).length;
          if (l > maxLength) maxLength = l;
        }
      }
      col.width = Math.max(12, Math.min(maxLength + 4, 45));
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  throw new Error(`Unsupported export format: ${format}`);
}
