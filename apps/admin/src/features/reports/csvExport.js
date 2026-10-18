/**
 * Escapes a cell value for RFC 4180 CSV export with formula injection prevention.
 *
 * @param {unknown} val
 * @returns {string}
 */
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Neutralize formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Downloads tabular data as a CSV file in the browser.
 *
 * @param {string} filename
 * @param {Array<{ key: string, label: string }>} columns
 * @param {Array<Record<string, unknown>>} rows
 */
export function downloadCsv(filename, columns, rows) {
  const headerLine = columns.map((c) => escapeCsvCell(c.label)).join(',');
  const rowLines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','));

  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
