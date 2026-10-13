import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createLocalStorage } from '../../../adapters/storage/local.js';
import { isSafeKey, setStorage } from '../../../adapters/storage/index.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const up = { db: () => true, redis: async () => true };
const PUBLIC = 'http://api.test/media';
let app;
let dir;
const tokens = {};
const jobs = [];

const png = (w = 1200, h = 900, background = '#3366cc') =>
  sharp({ create: { width: w, height: h, channels: 3, background } })
    .png()
    .toBuffer();

/** Product editor without media.manage: may pick/upload images, not manage the library. */
async function productEditorRole() {
  const { Role } = await import('../../rbac/role.model.js');
  const role = await Role.create({
    name: 'Product Editor',
    nameKey: 'product editor',
    permissions: ['product.view', 'product.update'],
  });
  return String(role._id);
}

const auth = (who, req) => req.set('Authorization', `Bearer ${tokens[who]}`);
const upload = (who, buf, { filename = 'Photo.png', alt } = {}) => {
  const req = auth(who, request(app).post('/api/v1/media'));
  if (alt !== undefined) req.field('alt', alt);
  return req.attach('file', buf, { filename, contentType: 'image/png' });
};
const pathOf = (url) => url.replace(PUBLIC, '');
const listFiles = async () =>
  (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.webp'));

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'media-test-'));
  setStorage(createLocalStorage({ rootDir: dir, publicUrl: PUBLIC }));
  setTranslationScheduler(async (job) => jobs.push(job));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

beforeEach(async () => {
  jobs.length = 0;
  for (const entry of await readdir(dir)) await rm(path.join(dir, entry), { recursive: true });
  await loadSettings();
  app = createApp({ checks: up });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  for (const [who, systemKey] of [
    ['catalog', 'catalog_editor'],
    ['cashier', 'cashier'],
    ['editor', null],
  ]) {
    await createStaff(null, {
      name: 'Staff Member',
      email: `${who}@shop.test`,
      password: PW,
      roleId: systemKey ? await findSystemRoleId(systemKey) : await productEditorRole(),
      branchIds: [],
    });
  }
  for (const who of ['root', 'catalog', 'cashier', 'editor']) {
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: `${who}@shop.test`, password: PW });
    tokens[who] = res.body.data.accessToken;
  }
});

describe('media API', () => {
  it('uploads: sniffs, re-encodes to WebP variants, stores random keys, schedules alt translation', async () => {
    const res = await upload('catalog', await png(), {
      filename: 'C:\\fakepath\\Summer <Sale>.PNG',
      alt: 'Blue summer banner',
    });
    expect(res.status).toBe(201);
    const m = res.body.data;
    expect(m).toMatchObject({
      name: 'Summer Sale.PNG', // base name only; markup characters stripped
      mime: 'image/webp',
      sourceFormat: 'png',
      width: 1200,
      height: 900,
      alt: { en: 'Blue summer banner' },
    });
    expect(Object.keys(m.variants).sort()).toEqual(['full', 'md', 'thumb']);
    expect(m.variants.thumb).toMatchObject({ width: 320, height: 240 });
    expect(m.url).toMatch(/^http:\/\/api\.test\/media\/\d{4}\/\d{2}\/[a-f0-9]{32}-full\.webp$/);
    expect((await listFiles()).length).toBe(3);
    for (const v of Object.values(m.variants)) expect(isSafeKey(pathOf(v.url).slice(1))).toBe(true);
    expect(jobs).toEqual([{ model: 'Media', id: m.id, items: [{ field: 'alt', lang: 'ar' }] }]);

    // Served by the API with safe headers.
    const file = await request(app).get(`/media${pathOf(m.url)}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(file.headers['cache-control']).toContain('immutable');

    // Audited.
    await waitFor(async () => {
      const audit = await auth('root', request(app).get('/api/v1/audit?action=media.uploaded'));
      return audit.body.data?.length === 1;
    });
  });

  it('returns the existing item for identical bytes (no duplicate files)', async () => {
    const buf = await png(400, 300);
    const first = await upload('catalog', buf);
    const again = await upload('catalog', buf, { filename: 'copy.png' });
    expect(again.status).toBe(200);
    expect(again.body.meta).toEqual({ duplicate: true });
    expect(again.body.data.id).toBe(first.body.data.id);
    expect((await listFiles()).length).toBe(2); // full + thumb, once
  });

  it('rejects non-images by content, whatever the name/MIME claims (415)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    for (const buf of [svg, html, Buffer.from('MZ' + 'A'.repeat(100))]) {
      const res = await upload('catalog', buf, { filename: 'image.png' });
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
    expect(await listFiles()).toEqual([]);
  });

  it('enforces the size setting (413), single file, multipart only, and the alt field rules', async () => {
    await auth('root', request(app).patch('/api/v1/settings')).send({
      changes: [{ key: 'media.maxUploadMb', value: 1 }],
    });
    const noise = await sharp(
      Buffer.from(Array.from({ length: 800 * 800 * 3 }, () => (Math.random() * 256) | 0)),
      {
        raw: { width: 800, height: 800, channels: 3 },
      },
    )
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(noise.length).toBeGreaterThan(1024 * 1024);
    const big = await upload('catalog', noise);
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const small = await png(10, 10);
    const two = await auth('catalog', request(app).post('/api/v1/media'))
      .attach('file', small, 'a.png')
      .attach('file', small, 'b.png');
    expect(two.status).toBe(400);
    const wrongField = await auth('catalog', request(app).post('/api/v1/media')).attach(
      'other',
      small,
      'a.png',
    );
    expect(wrongField.status).toBe(400);
    const json = await auth('catalog', request(app).post('/api/v1/media')).send({ file: 'x' });
    expect(json.status).toBe(400);
    const missing = await auth('catalog', request(app).post('/api/v1/media')).field('alt', 'x');
    expect(missing.status).toBe(400);
    const badAlt = await upload('catalog', small, { alt: '<img src=x onerror=alert(1)>' });
    expect(badAlt.status).toBe(400);
    expect(badAlt.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('authorization: 401 anonymous, 403 without permission, editors can use, only media.manage edits', async () => {
    const buf = await png(50, 50);
    expect((await request(app).post('/api/v1/media').attach('file', buf, 'a.png')).status).toBe(
      401,
    );
    expect((await request(app).get('/api/v1/media')).status).toBe(401);
    expect((await upload('cashier', buf)).status).toBe(403);
    expect((await auth('cashier', request(app).get('/api/v1/media'))).status).toBe(403);

    // product editors may pick/upload but not edit or delete library items
    const created = await upload('editor', buf);
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await auth('editor', request(app).get('/api/v1/media'))).status).toBe(200);
    expect(
      (await auth('editor', request(app).patch(`/api/v1/media/${id}`)).send({ alt: 'x' })).status,
    ).toBe(403);
    expect((await auth('editor', request(app).delete(`/api/v1/media/${id}`))).status).toBe(403);
  });

  it('lists with search/pagination, edits alt/name, soft-deletes', async () => {
    const a = (
      await upload('catalog', await png(60, 60, '#f00'), {
        filename: 'red-shirt.png',
        alt: 'Red shirt',
      })
    ).body.data;
    await upload('catalog', await png(60, 60, '#0f0'), { filename: 'green.png' });
    await upload('catalog', await png(60, 60, '#00f'), {
      filename: 'blue.png',
      alt: 'Shirt in blue',
    });

    const all = await auth('catalog', request(app).get('/api/v1/media?limit=2'));
    expect(all.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
    expect(all.body.data).toHaveLength(2);
    const shirts = await auth('catalog', request(app).get('/api/v1/media?q=shirt'));
    expect(shirts.body.data.map((m) => m.name).sort()).toEqual(['blue.png', 'red-shirt.png']);
    // regex characters are literal
    expect((await auth('catalog', request(app).get('/api/v1/media?q=.*'))).body.data).toEqual([]);
    expect((await auth('catalog', request(app).get('/api/v1/media?sort=-hacked'))).status).toBe(
      400,
    );

    jobs.length = 0;
    const edited = await auth('catalog', request(app).patch(`/api/v1/media/${a.id}`)).send({
      alt: 'Red cotton shirt',
      name: 'red.png',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ name: 'red.png', alt: { en: 'Red cotton shirt' } });
    expect(jobs).toHaveLength(1);
    expect(
      (await auth('catalog', request(app).patch(`/api/v1/media/${a.id}`)).send({})).status,
    ).toBe(400);

    expect((await auth('catalog', request(app).delete(`/api/v1/media/${a.id}`))).status).toBe(204);
    expect((await auth('catalog', request(app).get(`/api/v1/media/${a.id}`))).status).toBe(404);
    expect((await auth('catalog', request(app).delete(`/api/v1/media/${a.id}`))).status).toBe(404);
    const after = await auth('catalog', request(app).get('/api/v1/media'));
    expect(after.body.meta.total).toBe(2);
    // files kept for existing references
    expect((await request(app).get(`/media${pathOf(a.url)}`)).status).toBe(200);
  });
});

describe('local storage + file serving', () => {
  it('only serves known image extensions; never traverses out of the root', async () => {
    const storage = createLocalStorage({ rootDir: dir, publicUrl: PUBLIC });
    await expect(storage.put('../escape.webp', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.put('/abs/x.webp', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.put('a/../../x.webp', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await storage.put('t/page.html', Buffer.from('<script>alert(1)</script>'));
    await storage.put(
      't/ok.webp',
      await sharp(await png(5, 5))
        .webp()
        .toBuffer(),
    );

    expect((await request(app).get('/media/t/page.html')).status).toBe(404);
    expect((await request(app).get('/media/t/ok.webp')).status).toBe(200);
    expect((await request(app).get('/media/t/missing.webp')).status).toBe(404);
    expect((await request(app).get('/media/..%2f..%2fetc%2fpasswd')).status).toBe(404);
    expect((await request(app).post('/media/t/ok.webp')).status).toBe(404);
    await storage.delete('t/ok.webp');
    await storage.delete('t/ok.webp'); // idempotent
    expect((await request(app).get('/media/t/ok.webp')).status).toBe(404);
  });
});
