import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Menu } from '../menu.model.js';
import { SiteLayout } from '../layout.model.js';
import { Page } from '../../pages/page.model.js';

/** P5.4 — the shop arranges its own header, footer, announcement bar and colours. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const SITE = '/api/v1/site';
let app;
let rootToken;
const scheduled = [];

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

const item = (id, label, over = {}) => ({ id, label, target: 'products', ...over });
const makeMenu = (over = {}) =>
  root
    .post(`${SITE}/menus`, {
      title: 'Main menu',
      location: 'header',
      items: [item('all', 'All products')],
      ...over,
    })
    .then((res) => ok(res, 201));

/** A published page, so a menu item can point at it. */
const makePage = async (title = 'About us') => {
  const page = await ok(
    await root.post('/api/v1/pages', {
      title,
      draft: { blocks: [{ id: 'blk-1', type: 'heading', props: { text: title } }] },
    }),
    201,
  );
  await ok(await root.post(`/api/v1/pages/${page.id}/publish`));
  return page;
};

beforeEach(async () => {
  scheduled.length = 0;
  setTranslationScheduler(async (job) => {
    scheduled.push(job);
  });
  await loadSettings();
  await Promise.all([Menu.init(), SiteLayout.init(), Page.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('menus', () => {
  it('derives an address from the title and keeps the items as arranged', async () => {
    const menu = await makeMenu({
      items: [
        item('shop', 'Shop', {
          children: [
            item('all', 'Everything'),
            item('offers', 'Offers', { target: 'url', href: '/search?sort=newest' }),
          ],
        }),
      ],
    });
    expect(menu).toMatchObject({ slug: 'main-menu', location: 'header' });
    expect(menu.items[0].children.map((c) => c.id)).toEqual(['all', 'offers']);
  });

  it('queues every label for translation, keyed by its item', async () => {
    await makeMenu({ items: [item('a', 'Offers'), item('b', 'Brands')] });
    const fields = scheduled.flatMap((j) => j.items.map((i) => i.field));
    expect(fields).toEqual(['texts.0.value', 'texts.1.value']);
  });

  it('forgets the text of an item the shop removed', async () => {
    const menu = await makeMenu({ items: [item('a', 'Offers'), item('b', 'Brands')] });
    const updated = await ok(
      await root.patch(`${SITE}/menus/${menu.id}`, { items: [item('b', 'Brands')] }),
    );
    expect(updated.texts.map((t) => t.key)).toEqual(['b']);
  });

  it('refuses an item that points nowhere, naming the field', async () => {
    const res = await root.post(`${SITE}/menus`, {
      title: 'Broken',
      location: 'footer',
      items: [item('a', 'Nowhere', { target: 'page', ref: null })],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('items.0.ref');
  });

  it('unwires a deleted menu from the header', async () => {
    const menu = await makeMenu();
    await ok(await root.patch(`${SITE}/layout`, { headerMenuId: menu.id }));
    expect(await root.del(`${SITE}/menus/${menu.id}`).then((r) => r.status)).toBe(204);
    expect((await ok(await root.get(`${SITE}/layout`))).headerMenuId).toBeNull();
    expect((await ok(await root.get(`${SITE}/menus`))).length).toBe(0);
  });
});

describe('the layout', () => {
  it('starts with the shop’s categories in the header and no announcement', async () => {
    const layout = await ok(await root.get(`${SITE}/layout`));
    expect(layout).toMatchObject({
      headerMenuId: null,
      showCategoryRow: true,
      announcement: { enabled: false, tone: 'primary' },
    });
    expect(layout.theme.radius).toBe('md');
  });

  it('saves the announcement bar as content to be translated', async () => {
    await ok(
      await root.patch(`${SITE}/layout`, {
        announcement: { enabled: true, text: 'Free delivery over 200 SAR', tone: 'dark' },
      }),
    );
    const layout = await ok(await root.get(`${SITE}/layout`));
    expect(layout.announcement).toMatchObject({
      enabled: true,
      text: { en: 'Free delivery over 200 SAR' },
      tone: 'dark',
    });
    expect(scheduled.flatMap((j) => j.items.map((i) => i.field))).toContain('announcement.text');
  });

  it('refuses a colour that is not a colour', async () => {
    const res = await root.patch(`${SITE}/layout`, { theme: { primary: 'rgb(1,2,3)' } });
    expect(res.status).toBe(400);
  });
});

describe('what the storefront asks for', () => {
  it('needs no account, and comes with the theme as CSS variables', async () => {
    await ok(await root.patch(`${SITE}/layout`, { theme: { primary: '#0A7B4C', radius: 'full' } }));
    const chrome = await ok(await request(app).get(`${SITE}/public`));
    expect(chrome.theme).toMatchObject({ '--primary': '#0a7b4c', '--radius': '2rem' });
    expect(chrome.header).toEqual({ showCategoryRow: true, menu: [] });
  });

  it('resolves what each item points at, in the visitor’s language', async () => {
    const page = await makePage('Delivery & returns');
    const menu = await makeMenu({
      items: [item('p', 'Delivery', { target: 'page', ref: page.id }), item('all', 'All products')],
    });
    await ok(await root.patch(`${SITE}/layout`, { headerMenuId: menu.id }));

    // A translation arrives for one label (the job would write exactly this).
    await Menu.updateOne(
      { _id: menu.id, 'texts.key': 'p' },
      { $set: { 'texts.$.value.ar': 'التوصيل' } },
    );

    const en = await ok(await request(app).get(`${SITE}/public?lang=en`));
    expect(en.header.menu).toEqual([
      { id: 'p', label: 'Delivery', href: '/p/delivery-returns', children: [] },
      { id: 'all', label: 'All products', href: '/search', children: [] },
    ]);
    const ar = await ok(await request(app).get(`${SITE}/public?lang=ar`));
    expect(ar.header.menu[0].label).toBe('التوصيل');
  });

  it('leaves out an item whose page is no longer published', async () => {
    const page = await makePage();
    const menu = await makeMenu({
      items: [item('p', 'About', { target: 'page', ref: page.id }), item('all', 'All products')],
    });
    await ok(await root.patch(`${SITE}/layout`, { headerMenuId: menu.id }));
    await ok(await root.post(`/api/v1/pages/${page.id}/unpublish`));

    const chrome = await ok(await request(app).get(`${SITE}/public`));
    expect(chrome.header.menu.map((i) => i.id)).toEqual(['all']);
  });

  it('shows the announcement only when it is on and says something', async () => {
    await ok(await root.patch(`${SITE}/layout`, { announcement: { enabled: true, text: '' } }));
    expect((await ok(await request(app).get(`${SITE}/public`))).announcement.enabled).toBe(false);

    await ok(await root.patch(`${SITE}/layout`, { announcement: { text: 'Eid hours' } }));
    const chrome = await ok(await request(app).get(`${SITE}/public`));
    expect(chrome.announcement).toMatchObject({ enabled: true, text: 'Eid hours' });
  });

  it('gives the footer its menus in the order the shop chose', async () => {
    const help = await makeMenu({
      title: 'Help',
      location: 'footer',
      items: [item('a', 'Track your order', { target: 'url', href: '/track' })],
    });
    const shop = await makeMenu({ title: 'Shop', location: 'footer' });
    await ok(
      await root.patch(`${SITE}/layout`, {
        footer: { note: 'Prices include VAT.', menuIds: [shop.id, help.id] },
      }),
    );
    const chrome = await ok(await request(app).get(`${SITE}/public`));
    expect(chrome.footer.menus.map((m) => m.title)).toEqual(['Shop', 'Help']);
    expect(chrome.footer.menus[1].items[0].href).toBe('/track');
    expect(chrome.footer.note).toBe('Prices include VAT.');
  });
});

describe('what the shop says about itself', () => {
  it('normalizes a phone and keeps the address as content to translate', async () => {
    await ok(
      await root.patch(`${SITE}/layout`, {
        contact: {
          phone: '0501234567',
          email: 'Hello@Shop.test',
          address: 'King Fahd Road, Riyadh',
          nationalAddress: 'RRRD2929',
        },
      }),
    );
    const layout = await ok(await root.get(`${SITE}/layout`));
    expect(layout.contact).toMatchObject({
      phone: '+966501234567',
      email: 'hello@shop.test',
      address: { en: 'King Fahd Road, Riyadh' },
      nationalAddress: 'RRRD2929',
    });
    expect(scheduled.flatMap((j) => j.items.map((i) => i.field))).toContain('contact.address');
  });

  it('keeps the social profiles the shop gave, and refuses an unknown platform', async () => {
    await ok(
      await root.patch(`${SITE}/layout`, {
        social: [{ platform: 'instagram', url: 'https://instagram.com/shop' }],
      }),
    );
    expect((await ok(await root.get(`${SITE}/layout`))).social).toEqual([
      { platform: 'instagram', url: 'https://instagram.com/shop' },
    ]);
    const bad = await root.patch(`${SITE}/layout`, {
      social: [{ platform: 'myspace', url: 'https://x.test' }],
    });
    expect(bad.status).toBe(400);
  });

  it('hands the storefront its SEO defaults, and can shut crawlers out', async () => {
    await ok(
      await root.patch(`${SITE}/layout`, {
        seo: {
          titleSuffix: 'Supershop',
          defaultDescription: 'Everyday essentials, delivered across the Kingdom.',
          indexable: false,
          robotsExtra: 'Disallow: /tmp',
        },
      }),
    );
    const chrome = await ok(await request(app).get(`${SITE}/public`));
    expect(chrome.seo).toEqual({
      titleSuffix: 'Supershop',
      defaultDescription: 'Everyday essentials, delivered across the Kingdom.',
      indexable: false,
      robotsExtra: 'Disallow: /tmp',
    });
  });

  it('comes with no pictures until the shop sets them', async () => {
    const chrome = await ok(await request(app).get(`${SITE}/public`));
    expect(chrome.brand).toEqual({ logo: null, favicon: null, ogImage: null, logoDisplay: 'both' });
  });
});

describe('redirects', () => {
  it('stores the address as a tidy path, whatever the admin typed', async () => {
    const redirect = await ok(
      await root.post(`${SITE}/redirects`, { from: '/Old-Offer/', to: '/search', note: 'Ramadan' }),
      201,
    );
    expect(redirect).toMatchObject({ from: '/old-offer', to: '/search', status: 301 });
  });

  it('refuses a second rule for the same address, pointing at the field', async () => {
    await ok(await root.post(`${SITE}/redirects`, { from: '/old', to: '/new' }), 201);
    const res = await root.post(`${SITE}/redirects`, { from: '/old', to: '/other' });
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].path).toBe('from');
  });

  it('insists on a destination unless the page is simply gone', async () => {
    expect((await root.post(`${SITE}/redirects`, { from: '/x' })).status).toBe(400);
    expect((await root.post(`${SITE}/redirects`, { from: '/x', status: 410 })).status).toBe(201);
  });

  it('gives the storefront the rules without an account, and forgets a deleted one', async () => {
    const redirect = await ok(
      await root.post(`${SITE}/redirects`, { from: '/old', to: '/new' }),
      201,
    );
    expect(await ok(await request(app).get(`${SITE}/redirects/public`))).toEqual([
      { from: '/old', to: '/new', status: 301 },
    ]);
    expect((await root.del(`${SITE}/redirects/${redirect.id}`)).status).toBe(204);
    expect(await ok(await request(app).get(`${SITE}/redirects/public`))).toEqual([]);
  });

  it('needs `seo.manage` to write one', async () => {
    const role = await ok(
      await root.post('/api/v1/roles', { name: 'Page reader 2', permissions: ['page.view'] }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Sam Seo',
        email: 'seo@shop.test',
        password: 'seo-pass-12345',
        roleId: role.id,
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'seo@shop.test', password: 'seo-pass-12345' })
    ).body.data.accessToken;
    const res = await request(app)
      .post(`${SITE}/redirects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ from: '/old', to: '/new' });
    expect(res.status).toBe(403);
  });
});

describe('the sitemap', () => {
  it('lists published pages only, with when they went live', async () => {
    const page = await makePage('Delivery');
    await ok(await root.post('/api/v1/pages', { title: 'Draft only' }), 201);
    const entries = await ok(await request(app).get('/api/v1/pages/public-sitemap'));
    expect(entries).toEqual([{ slug: 'delivery', updatedAt: expect.any(String) }]);
    expect(page.slug).toBe('delivery');
  });
});

describe('who may change the chrome', () => {
  it('needs an account to look and `menu.manage` to change anything', async () => {
    const menu = await makeMenu();
    expect((await request(app).get(`${SITE}/menus`)).status).toBe(401);

    const role = await ok(
      await root.post('/api/v1/roles', { name: 'Page reader', permissions: ['page.view'] }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Rita Reader',
        email: 'reader@shop.test',
        password: 'reader-pass-123',
        roleId: role.id,
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'reader@shop.test', password: 'reader-pass-123' })
    ).body.data.accessToken;
    const reader = {
      get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
      patch: (url, body) =>
        request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
      del: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
    };

    expect((await reader.get(`${SITE}/menus`)).status).toBe(200);
    expect((await reader.get(`${SITE}/layout`)).status).toBe(200);
    expect((await reader.patch(`${SITE}/layout`, { showCategoryRow: false })).status).toBe(403);
    expect((await reader.patch(`${SITE}/menus/${menu.id}`, { title: 'Mine' })).status).toBe(403);
    expect((await reader.del(`${SITE}/menus/${menu.id}`)).status).toBe(403);
  });
});
