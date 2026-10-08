import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_LIMITS,
  processImage,
  sniffImageType,
  UnsupportedImageError,
} from '../image.processor.js';

const OPTS = { maxDimension: 2560, quality: 80 };
const solid = (width, height, format, opts = {}) =>
  sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
    [format](opts)
    .toBuffer();

describe('sniffImageType (magic bytes)', () => {
  it('recognizes every allowed format by content', async () => {
    expect(sniffImageType(await solid(8, 8, 'jpeg'))).toBe('jpeg');
    expect(sniffImageType(await solid(8, 8, 'png'))).toBe('png');
    expect(sniffImageType(await solid(8, 8, 'webp'))).toBe('webp');
    expect(sniffImageType(await solid(8, 8, 'gif'))).toBe('gif');
    expect(sniffImageType(await solid(8, 8, 'avif'))).toBe('avif');
  });

  it('rejects SVG, HTML, scripts, PDFs, executables and short input', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(Buffer.from('<!doctype html><html><body>x</body></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7 aaaaaaaaaaaa'))).toBeNull();
    expect(sniffImageType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00'))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType('not a buffer')).toBeNull();
  });

  it('does not accept HEIC (ftyp without an AVIF brand)', () => {
    const heic = Buffer.alloc(32);
    heic.writeUInt32BE(24, 0);
    heic.write('ftypheic', 4, 'latin1');
    heic.write('mif1heic', 16, 'latin1');
    expect(sniffImageType(heic)).toBeNull();
  });
});

describe('processImage', () => {
  it('re-encodes to WebP variants, bounded by maxDimension, never enlarging', async () => {
    const out = await processImage(await solid(3000, 1500, 'jpeg'), OPTS);
    expect(out.sourceFormat).toBe('jpeg');
    expect(out.animated).toBe(false);
    const byName = Object.fromEntries(out.variants.map((v) => [v.name, v]));
    expect(Object.keys(byName).sort()).toEqual(['full', 'lg', 'md', 'thumb']);
    expect(byName.full).toMatchObject({ width: 2560, height: 1280 });
    expect(byName.lg).toMatchObject({ width: 1600, height: 800 });
    expect(byName.thumb).toMatchObject({ width: 320, height: 160 });
    for (const v of out.variants) {
      expect(sniffImageType(v.data)).toBe('webp');
      expect(v.bytes).toBe(v.data.length);
    }

    const small = await processImage(await solid(200, 100, 'png'), OPTS);
    expect(small.variants.map((v) => [v.name, v.width])).toEqual([
      ['full', 200],
      ['thumb', 200],
    ]);
  });

  it('strips metadata (EXIF/GPS) and applies EXIF orientation', async () => {
    const withExif = await sharp({
      create: { width: 40, height: 20, channels: 3, background: '#fff' },
    })
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'secret-owner' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await processImage(withExif, OPTS);
    const full = out.variants.find((v) => v.name === 'full');
    const meta = await sharp(full.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(full.data.includes(Buffer.from('secret-owner'))).toBe(false);
    // Orientation 6 = rotate 90°: 40×20 becomes 20×40.
    expect([full.width, full.height]).toEqual([20, 40]);
  });

  it('drops bytes appended after the image (polyglot payloads)', async () => {
    const payload = Buffer.from('<script>alert(document.cookie)</script>');
    const polyglot = Buffer.concat([await solid(30, 30, 'png'), payload]);
    const out = await processImage(polyglot, OPTS).catch((e) => e);
    if (out instanceof UnsupportedImageError) return; // strict decoders may refuse it outright
    for (const v of out.variants) expect(v.data.includes(payload)).toBe(false);
  });

  it('rejects disguised, truncated and oversized input', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(processImage(svg, OPTS)).rejects.toBeInstanceOf(UnsupportedImageError);

    // Valid JPEG magic, garbage body.
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(processImage(fakeJpeg, OPTS)).rejects.toBeInstanceOf(UnsupportedImageError);

    const png = await solid(400, 400, 'png');
    await expect(processImage(png.subarray(0, png.length - 40), OPTS)).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );

    // Decompression bomb guard: header claims more pixels than allowed.
    const side = Math.ceil(Math.sqrt(IMAGE_LIMITS.maxInputPixels)) + 10;
    const huge = await sharp({
      create: { width: side, height: side, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    await expect(processImage(huge, OPTS)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('keeps animated GIFs animated', async () => {
    const colors = ['#f00', '#0f0', '#00f'];
    const frames = await Promise.all(
      colors.map((background) =>
        sharp({ create: { width: 50, height: 30, channels: 3, background } })
          .png()
          .toBuffer(),
      ),
    );
    const anim = await sharp(frames, { join: { animated: true } })
      .gif({ delay: [100, 100, 100] })
      .toBuffer();
    const out = await processImage(anim, OPTS);
    expect(out.animated).toBe(true);
    const full = out.variants.find((v) => v.name === 'full');
    expect([full.width, full.height]).toEqual([50, 30]);
    expect((await sharp(full.data).metadata()).pages).toBe(colors.length);
  });
});
