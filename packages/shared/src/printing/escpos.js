/**
 * ESC/POS (P6.3): the command language every thermal receipt printer understands. Pure — it turns
 * a list of instructions into bytes, so receipts can be unit-tested byte for byte instead of
 * being judged by holding paper up to the light.
 *
 * Bytes go to the printer through QZ Tray on the admin machine; nothing here knows about that.
 */
const ESC = 0x1b;
const GS = 0x1d;

export const ALIGN = Object.freeze({ start: 0, center: 1, end: 2 });

/** Paper widths a shop may have, and how many characters fit on a line at font A. */
export const PAPER = Object.freeze({
  WIDTHS_MM: Object.freeze([58, 76, 80, 85]),
  CHARS_PER_LINE: Object.freeze({ 58: 32, 76: 42, 80: 48, 85: 50 }),
});

export const charsForWidth = (mm) => PAPER.CHARS_PER_LINE[mm] ?? PAPER.CHARS_PER_LINE[80];

/** Spaces `Intl` likes but a thermal printer does not: non-breaking and narrow no-break. */
const SPACES = /[\u00a0\u202f\u2007]/g;

const utf8 = new TextEncoder();
const utf8Decode = new TextDecoder('utf-8');
const isArabicCodePoint = (code) =>
  (code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f);

/**
 * Text → bytes. Formatted money arrives with a non-breaking space in it, which becomes a plain
 * one; Arabic script is encoded as UTF-8 (P6.4), while anything else a receipt code page cannot
 * show becomes '?' rather than nonsense.
 */
export function encodeText(text) {
  const out = [];
  for (const char of String(text ?? '').replace(SPACES, ' ')) {
    const code = char.codePointAt(0);
    if (code < 0x80) out.push(code);
    else if (isArabicCodePoint(code)) out.push(...utf8.encode(char));
    else out.push(0x3f);
  }
  return out;
}

/** Wraps a line to the paper width, breaking on spaces where it can. */
export function wrap(text, width) {
  const words = String(text ?? '')
    .replace(SPACES, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line.length) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
    while (line.length > width) {
      lines.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * `Oxford Shirt            115.00` — the name is cut to make room for the amount, and the amount
 * itself is cut if even that will not fit: a line wider than the paper prints as rubbish.
 */
export function columns(left, right, width) {
  const amount = String(right ?? '')
    .replace(SPACES, ' ')
    .slice(0, width);
  const room = Math.max(0, width - amount.length - 1);
  const name = String(left ?? '')
    .replace(SPACES, ' ')
    .slice(0, room);
  return `${name}${' '.repeat(Math.max(1, width - name.length - amount.length))}${amount}`;
}

/** QR payload → the three GS ( k calls that store and print it (model 2). */
function qrBytes(payload, { size = 6 } = {}) {
  const data = encodeTextRaw(payload);
  const len = data.length + 3;
  return [
    GS,
    0x28,
    0x6b,
    0x04,
    0x00,
    0x31,
    0x41,
    0x32,
    0x00, // model 2
    GS,
    0x28,
    0x6b,
    0x03,
    0x00,
    0x31,
    0x43,
    size, // module size
    GS,
    0x28,
    0x6b,
    0x03,
    0x00,
    0x31,
    0x45,
    0x31, // error correction L
    GS,
    0x28,
    0x6b,
    len & 0xff,
    (len >> 8) & 0xff,
    0x31,
    0x50,
    0x30,
    ...data, // store
    GS,
    0x28,
    0x6b,
    0x03,
    0x00,
    0x31,
    0x51,
    0x30, // print
  ];
}

/** A QR or a barcode carries bytes as they are (base64, digits) — no code-page substitution. */
const encodeTextRaw = (text) => [...String(text ?? '')].map((c) => c.codePointAt(0) & 0xff);

/** Code 128 (B) — what a shop's own labels use (P1.6 generates the codes). */
function code128Bytes(value, { height = 80, hri = true } = {}) {
  const data = encodeTextRaw(`{B${value}`);
  return [
    GS,
    0x68,
    height, // height in dots
    GS,
    0x48,
    hri ? 0x02 : 0x00, // human-readable text below, or none
    GS,
    0x6b,
    0x49,
    data.length,
    ...data,
  ];
}

/**
 * Instructions → bytes.
 *
 * `{ type: 'text', value, align?, bold?, double? }` · `{ type: 'line' }` (a rule of dashes) ·
 * `{ type: 'row', left, right }` · `{ type: 'qr', value }` · `{ type: 'barcode', value }` ·
 * `{ type: 'feed', lines? }` · `{ type: 'cut' }` · `{ type: 'drawer' }`
 *
 * @param {object[]} commands
 * @param {{ width?: number }} [opts] characters per line (from the paper width)
 * @returns {Uint8Array}
 */
export function renderEscPos(commands, { width = 48 } = {}) {
  const out = [ESC, 0x40]; // initialise: forget whatever the last receipt left set
  const line = (text) => out.push(...encodeText(text), 0x0a);

  for (const command of commands ?? []) {
    switch (command.type) {
      case 'text': {
        out.push(ESC, 0x61, ALIGN[command.align ?? 'start'] ?? 0);
        if (command.bold) out.push(ESC, 0x45, 1);
        if (command.double) out.push(GS, 0x21, 0x11);
        for (const part of wrap(command.value, command.double ? Math.floor(width / 2) : width))
          line(part);
        if (command.double) out.push(GS, 0x21, 0x00);
        if (command.bold) out.push(ESC, 0x45, 0);
        break;
      }
      case 'row':
        out.push(ESC, 0x61, 0);
        if (command.bold) out.push(ESC, 0x45, 1);
        line(columns(command.left, command.right, width));
        if (command.bold) out.push(ESC, 0x45, 0);
        break;
      case 'line':
        out.push(ESC, 0x61, 0);
        line((command.char ?? '-').repeat(width));
        break;
      case 'qr':
        out.push(ESC, 0x61, ALIGN[command.align ?? 'center']);
        out.push(...qrBytes(command.value, { size: command.size }));
        out.push(0x0a);
        break;
      case 'barcode':
        out.push(ESC, 0x61, ALIGN[command.align ?? 'center']);
        out.push(...code128Bytes(command.value, { height: command.height, hri: command.hri }));
        out.push(0x0a);
        break;
      case 'feed':
        out.push(ESC, 0x64, command.lines ?? 1);
        break;
      case 'cut':
        out.push(ESC, 0x64, 3, GS, 0x56, 66, 0); // feed clear of the blade, then partial cut
        break;
      case 'drawer':
        out.push(ESC, 0x70, 0x00, 0x19, 0xfa); // kick pin 2
        break;
      default:
        break; // an instruction this printer layer does not know is skipped, never guessed at
    }
  }
  return Uint8Array.from(out);
}

/** The bytes as QZ Tray wants them for a raw print job. */
export const toBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
};

/**
 * Reads bytes back as the lines they will print. Written for the receipt preview (P6.4) and for
 * tests: it understands the sequences this builder emits and skips them, so what comes out is
 * what a customer would read on the paper.
 *
 * @param {Uint8Array | number[]} bytes
 * @returns {string[]}
 */
export function previewLines(bytes) {
  const lines = [];
  let lineBytes = [];
  const flush = () => {
    const line = utf8Decode.decode(Uint8Array.from(lineBytes));
    if (line.trim()) lines.push(line.replace(/\s+$/, ''));
    lineBytes = [];
  };
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte === ESC) {
      const cmd = bytes[i + 1];
      i += cmd === 0x70 ? 4 : cmd === 0x40 ? 1 : 2; // drawer kick / initialise / one argument
    } else if (byte === GS) {
      const cmd = bytes[i + 1];
      if (cmd === 0x28)
        i += 4 + (bytes[i + 3] | (bytes[i + 4] << 8)); // GS ( k pL pH … payload
      else if (cmd === 0x6b)
        i += 3 + bytes[i + 3]; // GS k m len data (barcode)
      else if (cmd === 0x56)
        i += 3; // cut
      else i += 2; // GS ! n, GS h n, GS H n
    } else if (byte === 0x0a) {
      flush();
    } else {
      lineBytes.push(byte);
    }
  }
  flush();
  return lines;
}
