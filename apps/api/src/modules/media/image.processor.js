import sharp from 'sharp';

/**
 * Image intake (CLAUDE.md §5.1): the real type comes from the file's magic bytes (never the
 * client's name/MIME), the decoder must agree, and every image is re-encoded to WebP — which
 * drops EXIF/GPS/ICC metadata and any payload hidden after the image data.
 */

/** Hard safety ceilings (not business settings): decompression-bomb and frame-count guards. */
export const IMAGE_LIMITS = Object.freeze({
  maxInputPixels: 40_000_000, // e.g. 8000×5000; animations count all frames
  maxFrames: 300,
});

/** Variant name → longest side in px. `full` is capped by the `media.maxDimension` setting. */
export const VARIANT_SIZES = Object.freeze({ thumb: 320, md: 800, lg: 1600 });

const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

/**
 * Detects the image type from magic bytes. SVG/HTML/anything else → null (rejected).
 * @param {Buffer} buf
 * @returns {'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | null}
 */
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  const head6 = ascii(buf, 0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'webp';
  // ISO-BMFF: [size]['ftyp'][major brand][minor version][compatible brands…]
  if (ascii(buf, 4, 8) === 'ftyp') {
    const boxSize = Math.min(buf.readUInt32BE(0), buf.length, 64);
    const brands = [ascii(buf, 8, 12)];
    for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(buf, i, i + 4));
    if (brands.some((b) => b === 'avif' || b === 'avis')) return 'avif';
  }
  return null;
}

/** sharp reports AVIF as `heif` with `compression: 'av1'` (HEIC = hevc is not accepted). */
const decoderAgrees = (type, meta) =>
  type === 'avif' ? meta.format === 'heif' && meta.compression === 'av1' : meta.format === type;

export class UnsupportedImageError extends Error {}

/**
 * Validates and re-encodes an upload into WebP variants.
 * @param {Buffer} buf
 * @param {{ maxDimension: number, quality: number }} opts
 * @returns {Promise<{ sourceFormat: string, animated: boolean,
 *   variants: { name: string, data: Buffer, width: number, height: number, bytes: number }[] }>}
 */
export async function processImage(buf, { maxDimension, quality }) {
  const type = sniffImageType(buf);
  if (!type) throw new UnsupportedImageError('not an allowed image type');

  const input = {
    failOn: /** @type {const} */ ('warning'),
    limitInputPixels: IMAGE_LIMITS.maxInputPixels,
    autoOrient: true,
  };
  let meta;
  try {
    meta = await sharp(buf, input).metadata();
  } catch (err) {
    throw new UnsupportedImageError('image could not be decoded', { cause: err });
  }
  if (!decoderAgrees(type, meta)) throw new UnsupportedImageError('content does not match type');
  const frames = meta.pages ?? 1;
  if (frames > IMAGE_LIMITS.maxFrames) throw new UnsupportedImageError('too many frames');
  const animated = frames > 1 && (type === 'gif' || type === 'webp');

  const pageHeight = animated ? (meta.pageHeight ?? meta.height) : meta.height;
  const { width, height } = animated ? { width: meta.width, height: pageHeight } : meta.autoOrient;
  const longest = Math.max(width, height);

  const sizes = [['full', Math.min(longest, maxDimension)]];
  for (const [name, size] of Object.entries(VARIANT_SIZES)) {
    // thumb always exists (grids/pickers); larger steps only when they shrink the image.
    if (name === 'thumb' || size < sizes[0][1]) sizes.push([name, Math.min(size, sizes[0][1])]);
  }

  const encode = async ([name, size]) => {
    try {
      const { data, info } = await sharp(buf, { ...input, animated })
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return {
        name,
        data,
        width: info.width,
        height: animated ? (info.pageHeight ?? info.height) : info.height,
        bytes: info.size,
      };
    } catch (err) {
      throw new UnsupportedImageError('image could not be processed', { cause: err });
    }
  };
  // Sequential: bounds peak memory per upload (sharp itself uses the libuv thread pool).
  const variants = [];
  for (const s of sizes) variants.push(await encode(s));
  return { sourceFormat: type, animated, variants };
}
