/**
 * Minimal RFC 4180 CSV parser/writer (no dependency). Handles quoted fields, escaped quotes ("")
 * embedded commas/newlines, CRLF/LF, a UTF-8 BOM, and `,` / `;` / tab delimiters (auto-detected
 * from the header line — Excel uses `;` in some locales).
 */

export class CsvError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

function detectDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

/**
 * @param {string} input
 * @returns {{ line: number, cells: string[] }[]} records with their 1-based starting line
 */
export function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (!(cells.length === 1 && cells[0] === '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else cell += ch;
  }
  if (quoted) throw new CsvError('Unclosed quoted field', recordLine);
  if (cell !== '' || cells.length) endRecord();
  return records;
}

/**
 * Spreadsheet formula injection (OWASP "CSV injection"): text starting with = + - @ or a control
 * char is prefixed with an apostrophe so Excel/Sheets show it as text. Plain numbers stay as is.
 */
export const neutralizeFormula = (value) =>
  typeof value === 'string' && /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value)
    ? `'${value}`
    : value;

/** Reverses `neutralizeFormula` on import so exported text round-trips unchanged. */
export const unneutralize = (value) =>
  typeof value === 'string' && /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;

const quote = (value) => {
  const s = value == null ? '' : String(neutralizeFormula(value));
  return /[",\r\n;]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows → CSV text with CRLF line endings and a BOM (Excel opens UTF-8 — Arabic — correctly). */
export const toCsv = (rows) => `\uFEFF${rows.map((r) => r.map(quote).join(',')).join('\r\n')}\r\n`;
