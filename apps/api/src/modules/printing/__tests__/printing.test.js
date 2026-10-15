import crypto from 'node:crypto';
import { previewLines } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { PrinterProfile } from '../printer.model.js';

/** P6.3 — the printers a shop has, and the key that lets its tills use them. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const PRINTING = '/api/v1/printing';
let app;
let rootToken;
const ids = {};

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  del: (url) => request(app).delete(url).set('Authorization', `Bearer ${rootToken}`),
};

/** A throwaway key pair: the shop's own would never be in a test. */
const keys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const setUpPrinting = () =>
  root.patch('/api/v1/settings', {
    changes: [
      { key: 'printing.enabled', value: true },
      {
        key: 'printing.qzCertificate',
        value: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      },
      { key: 'printing.qzPrivateKey', value: keys.privateKey },
    ],
  });

const makePrinter = (over = {}) =>
  root
    .post(`${PRINTING}/profiles`, { name: 'Front till', printer: 'EPSON TM-T20', ...over })
    .then((res) => ok(res, 201));

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await PrinterProfile.init();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW })
  ).body.data.accessToken;
  ids.shop = (
    await ok(await root.post('/api/v1/branches', { code: 'SHOP', name: 'Shop' }), 201)
  ).id;
});

describe('setting printing up', () => {
  it('says it is not ready until the shop has put its keys in', async () => {
    expect(await ok(await root.get(`${PRINTING}/status`))).toEqual({
      enabled: false,
      autoPrintReceipt: true,
      configured: false,
    });
    expect((await root.get(`${PRINTING}/certificate`)).status).toBe(503);
    expect((await root.post(`${PRINTING}/sign`, { data: '{"call":"printers.find"}' })).status).toBe(
      503,
    );
  });

  it('hands out the certificate and signs a call once it is', async () => {
    await ok(await setUpPrinting());
    expect((await root.get(`${PRINTING}/certificate`)).text).toContain('BEGIN CERTIFICATE');

    const message = '{"call":"print","timestamp":1}';
    const { signature } = await ok(await root.post(`${PRINTING}/sign`, { data: message }));
    const valid = crypto
      .createVerify('RSA-SHA512')
      .update(message)
      .verify(keys.publicKey, signature, 'base64');
    expect(valid).toBe(true);
  });

  it('never gives the private key back, however it is asked for', async () => {
    await ok(await setUpPrinting());
    const settings = await ok(await root.get('/api/v1/settings?group=printing'));
    const key = settings.find((s) => s.key === 'printing.qzPrivateKey');
    expect(key.value).toEqual({ isSet: true, masked: expect.any(String) });
    expect(JSON.stringify(settings)).not.toContain('PRIVATE KEY');
  });

  it('refuses to sign for someone who is not staff', async () => {
    await ok(await setUpPrinting());
    expect(
      (
        await request(app)
          .post(`${PRINTING}/sign`)
          .send({ data: 'x'.repeat(10) })
      ).status,
    ).toBe(401);
  });

  it('refuses to sign something that is not a call', async () => {
    await ok(await setUpPrinting());
    expect((await root.post(`${PRINTING}/sign`, { data: '' })).status).toBe(400);
    expect((await root.post(`${PRINTING}/sign`, { data: 'x'.repeat(5000) })).status).toBe(400);
  });
});

describe('the printers a shop has', () => {
  it('adds one with sensible defaults and lists it', async () => {
    const printer = await makePrinter();
    expect(printer).toMatchObject({
      name: 'Front till',
      printer: 'EPSON TM-T20',
      kind: 'receipt',
      widthMm: 80,
      cut: true,
      openDrawer: false,
    });
    expect((await ok(await root.get(`${PRINTING}/profiles`))).map((p) => p.id)).toEqual([
      printer.id,
    ]);
  });

  it('keeps one default per kind and branch', async () => {
    const first = await makePrinter({ name: 'Front', isDefault: true });
    const second = await makePrinter({ name: 'Back', isDefault: true });
    const list = await ok(await root.get(`${PRINTING}/profiles`));
    expect(list.find((p) => p.id === first.id).isDefault).toBe(false);
    expect(list.find((p) => p.id === second.id).isDefault).toBe(true);
  });

  it('refuses a paper width no printer has', async () => {
    const res = await root.post(`${PRINTING}/profiles`, {
      name: 'Odd',
      printer: 'P',
      widthMm: 70,
    });
    expect(res.status).toBe(400);
  });

  it('lets a cashier see the printers but not change them', async () => {
    await makePrinter();
    const role = await ok(
      await root.post('/api/v1/roles', { name: 'Till only', permissions: ['pos.sell'] }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Cassy',
        email: 'cassy@shop.test',
        password: 'cassy-pass-123',
        roleId: role.id,
        branchIds: [ids.shop],
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'cassy@shop.test', password: 'cassy-pass-123' })
    ).body.data.accessToken;
    const cashier = {
      get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
      post: (url, body) =>
        request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    };
    expect((await cashier.get(`${PRINTING}/profiles`)).status).toBe(200);
    expect(
      (await cashier.post(`${PRINTING}/profiles`, { name: 'Mine', printer: 'X' })).status,
    ).toBe(403);
  });
});

describe('a receipt for a sale', () => {
  /** A sale at the counter, rung up the ordinary way (P6.1). */
  const sell = async () => {
    const shirt = await ok(
      await root.post('/api/v1/products', {
        name: 'Oxford Shirt',
        status: 'active',
        variants: [{ sku: 'OX-RED', price: 11_500 }],
      }),
      201,
    );
    await ok(
      await root.post('/api/v1/inventory/receive', {
        branchId: ids.shop,
        lines: [{ variantId: shirt.variants[0].id, qty: 5 }],
      }),
      201,
    );
    return ok(
      await root.post('/api/v1/pos/sales', {
        branchId: ids.shop,
        items: [{ variantId: shirt.variants[0].id, qty: 2 }],
        payments: [{ method: 'cash', amount: 25_000 }],
      }),
      201,
    );
  };

  it('comes back as bytes for the printer it belongs on', async () => {
    const printer = await makePrinter({ isDefault: true, widthMm: 58 });
    const sale = await sell();
    const job = await ok(await root.get(`${PRINTING}/receipt/${sale.id}`));

    expect(job).toMatchObject({ printer: 'EPSON TM-T20', profileId: printer.id, widthMm: 58 });
    const lines = previewLines(Buffer.from(job.data, 'base64'));
    expect(lines).toEqual(expect.arrayContaining(['Supershop'])); // the shop's own name, from settings
    expect(lines.some((l) => l.includes(sale.orderNo))).toBe(true);
    expect(lines.some((l) => l.includes('Oxford Shirt'))).toBe(true);
    expect(lines.some((l) => l.includes('Cash'))).toBe(true);
    // Every line fits 58 mm paper (32 characters).
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(32);
  });

  it('kicks the drawer open only when that printer is asked to', async () => {
    await makePrinter({ isDefault: true, openDrawer: true });
    const sale = await sell();
    const job = await ok(await root.get(`${PRINTING}/receipt/${sale.id}`));
    expect([...Buffer.from(job.data, 'base64')].join(',')).toContain('27,112,0,25,250');
  });

  it('says so plainly when the shop has no printer set up', async () => {
    const sale = await sell();
    const res = await root.get(`${PRINTING}/receipt/${sale.id}`);
    expect(res.status).toBe(409);
  });

  it('is refused for an order from a branch the cashier does not work in', async () => {
    await makePrinter({ isDefault: true });
    const sale = await sell();
    const other = (await ok(await root.post('/api/v1/branches', { code: 'WEB', name: 'Web' }), 201))
      .id;
    const role = await ok(
      await root.post('/api/v1/roles', { name: 'Other till', permissions: ['pos.sell'] }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Omar',
        email: 'omar@shop.test',
        password: 'omar-pass-1234',
        roleId: role.id,
        branchIds: [other],
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'omar@shop.test', password: 'omar-pass-1234' })
    ).body.data.accessToken;
    const res = await request(app)
      .get(`${PRINTING}/receipt/${sale.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
