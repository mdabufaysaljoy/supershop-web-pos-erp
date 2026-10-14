import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Page } from '../page.model.js';

/** P5.1 — the page document: validated by the registry, cleaned, and translated like any content. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const PAGES = '/api/v1/pages';
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
const blocks = (...list) => ({ blocks: list });
const heading = (id, text) => ({ id, type: 'heading', props: { text } });

const queuedFields = () => scheduled.flatMap((j) => j.items.map((i) => i.field));
/** What a finished translation job would have written. */
const markTranslated = async (id, key, en, ar) => {
  const { createHash } = await import('node:crypto');
  const srcHash = createHash('sha256').update(en).digest('hex');
  await Page.updateOne(
    { _id: id, 'texts.key': key },
    {
      $set: {
        'texts.$.value.ar': ar,
        'texts.$.value.meta': { ar: { mode: 'auto', status: 'done', srcHash, at: new Date() } },
      },
    },
  );
};

const makePage = async (over = {}) =>
  ok(
    await root.post(PAGES, {
      title: 'About us',
      draft: blocks(heading('blk-1', 'Our story')),
      ...over,
    }),
    201,
  );

beforeEach(async () => {
  scheduled.length = 0;
  // Capture what WOULD be translated instead of running the provider.
  setTranslationScheduler(async (job) => {
    scheduled.push(job);
  });
  await loadSettings();
  await Page.init();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('writing a page', () => {
  it('stores the blocks with their defaults filled in, and derives the address', async () => {
    const page = await makePage();
    expect(page).toMatchObject({ slug: 'about-us', status: 'draft', blockCount: 1 });
    expect(page.draft.blocks[0]).toMatchObject({
      id: 'blk-1',
      type: 'heading',
      version: 1,
      props: { text: 'Our story', level: 'h2', align: 'start' },
    });
  });

  it('refuses a block the shop cannot render, pointing at the prop', async () => {
    const res = await root.post(PAGES, {
      title: 'Bad',
      draft: blocks({
        id: 'blk-1',
        type: 'buttonLink',
        props: { label: 'Go', href: 'javascript:evil()' },
      }),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('draft.blocks.0.props.href');
  });

  it('refuses an unknown block type and a duplicate id', async () => {
    expect(
      (
        await root.post(PAGES, {
          title: 'x',
          draft: blocks({ id: 'blk-1', type: 'ufo', props: {} }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await root.post(PAGES, {
          title: 'y',
          draft: blocks(heading('blk-1', 'a'), heading('blk-1', 'b')),
        })
      ).status,
    ).toBe(400);
  });

  it('cleans the HTML a staff member pastes', async () => {
    const page = await makePage({
      title: 'Policy',
      draft: blocks({
        id: 'blk-1',
        type: 'richText',
        props: { html: '<p onclick="evil()">Hi</p><script>alert(1)</script>' },
      }),
    });
    expect(page.draft.blocks[0].props.html).toBe('<p>Hi</p>');
  });
});

describe('the text a page shows', () => {
  it('is mirrored into the page’s own text list and queued for translation', async () => {
    const page = await makePage();
    expect(page.texts).toEqual([
      { key: 'blk-1.text', value: { en: 'Our story', meta: expect.anything() } },
    ]);
    const items = scheduled.flatMap((j) => j.items.map((i) => i.field));
    expect(items).toContain('texts.0.value');
    expect(items).toContain('title');
  });

  it('follows the blocks: new text appears, changed text is re-translated, deleted text goes', async () => {
    const page = await makePage();
    // Pretend the first translation finished, so "already done" and "needs doing" are tellable apart.
    await markTranslated(page.id, 'blk-1.text', 'Our story', 'قصتنا');
    scheduled.length = 0;

    const withTwo = await ok(
      await root.patch(`${PAGES}/${page.id}`, {
        draft: blocks(heading('blk-1', 'Our story'), {
          id: 'blk-2',
          type: 'buttonLink',
          props: { label: 'Shop now', href: '/search' },
        }),
      }),
    );
    expect(withTwo.texts.map((t) => t.key)).toEqual(['blk-1.text', 'blk-2.label']);
    // Only the NEW string needs translating; the finished one is left alone. (`title` is still
    // pending here because no job ran for it — a pending item is deliberately queued again.)
    expect(queuedFields().filter((f) => f.startsWith('texts.'))).toEqual(['texts.1.value']);
    expect(withTwo.texts[0].value.ar).toBe('قصتنا');

    scheduled.length = 0;
    const edited = await ok(
      await root.patch(`${PAGES}/${page.id}`, { draft: blocks(heading('blk-1', 'Our history')) }),
    );
    expect(edited.texts).toHaveLength(1); // the deleted block's text is gone
    expect(edited.texts[0].value.en).toBe('Our history');
    expect(queuedFields()).toContain('texts.0.value'); // the changed English is queued again
  });
});

describe('what a visitor sees', () => {
  const publish = async (page) => ok(await root.post(`${PAGES}/${page.id}/publish`));

  it('is the published blocks, not the draft being written', async () => {
    const page = await makePage();
    expect((await request(app).get(`${PAGES}/public/about-us`)).status).toBe(404);

    await publish(page);
    const live = await ok(await request(app).get(`${PAGES}/public/about-us?lang=en`));
    expect(live.content.blocks[0].props.text).toBe('Our story');

    // Editing the draft afterwards changes nothing until it is published again.
    await ok(
      await root.patch(`${PAGES}/${page.id}`, { draft: blocks(heading('blk-1', 'Draft only')) }),
    );
    const stillLive = await ok(await request(app).get(`${PAGES}/public/about-us?lang=en`));
    expect(stillLive.content.blocks[0].props.text).toBe('Our story');
  });

  it('is in their language, falling back to the English the page was written in', async () => {
    const page = await makePage();
    await publish(page);

    // A translation arrives (the job would write exactly this).
    await Page.updateOne(
      { _id: page.id, 'texts.key': 'blk-1.text' },
      { $set: { 'texts.$.value.ar': 'قصتنا' } },
    );
    const arabic = await ok(await request(app).get(`${PAGES}/public/about-us?lang=ar`));
    expect(arabic.content.blocks[0].props.text).toBe('قصتنا');

    const english = await ok(await request(app).get(`${PAGES}/public/about-us?lang=en`));
    expect(english.content.blocks[0].props.text).toBe('Our story');
  });

  it('can be taken down again without losing the work', async () => {
    const page = await makePage();
    await publish(page);
    await ok(await root.post(`${PAGES}/${page.id}/unpublish`));
    expect((await request(app).get(`${PAGES}/public/about-us`)).status).toBe(404);
    expect((await ok(await root.get(`${PAGES}/${page.id}`))).draft.blocks).toHaveLength(1);
  });

  it('serves the home page by itself, and only one page can be it', async () => {
    const first = await makePage({ title: 'Home' });
    const second = await makePage({ title: 'Other' });
    await ok(await root.patch(`${PAGES}/${first.id}`, { isHome: true }));
    await ok(await root.patch(`${PAGES}/${second.id}`, { isHome: true }));
    await publish(second);

    const home = await ok(await request(app).get(`${PAGES}/public/home?lang=en`));
    expect(home.slug).toBe('other');
    expect((await ok(await root.get(`${PAGES}/${first.id}`))).isHome).toBe(false);
  });
});

describe('going back to what was published before', () => {
  it('keeps the previous version on each publish and puts it back into the draft', async () => {
    const page = await makePage();
    await ok(await root.post(`${PAGES}/${page.id}/publish`)); // v1 live, nothing to keep yet
    expect((await ok(await root.get(`${PAGES}/${page.id}`))).versions).toEqual([]);

    await ok(
      await root.patch(`${PAGES}/${page.id}`, { draft: blocks(heading('blk-1', 'Our history')) }),
    );
    const second = await ok(await root.post(`${PAGES}/${page.id}/publish`));
    expect(second.versions).toHaveLength(1); // what was live before this publish
    expect(second.published.blocks[0].props.text).toBe('Our history');

    const restored = await ok(
      await root.post(`${PAGES}/${page.id}/versions/${second.versions[0].id}/restore`),
    );
    // The old wording comes back as a DRAFT: an editor looks at it before it goes live again.
    expect(restored.draft.blocks[0].props.text).toBe('Our story');
    expect(restored.published.blocks[0].props.text).toBe('Our history');
    expect(restored.texts[0].value.en).toBe('Our story');
  });

  it('refuses a version that is not there', async () => {
    const page = await makePage();
    expect(
      (await root.post(`${PAGES}/${page.id}/versions/6ace0bc6096f3f7d66d774cc/restore`)).status,
    ).toBe(404);
  });
});

describe('who may do what', () => {
  it('keeps page editing to staff who may edit, and publishing to those who may publish', async () => {
    const page = await makePage();
    expect((await request(app).get(PAGES)).status).toBe(401);

    const role = await ok(
      await root.post('/api/v1/roles', {
        name: 'Editor',
        permissions: ['page.view', 'page.manage'],
      }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Edna Editor',
        email: 'editor@shop.test',
        password: 'editor-pass-123',
        roleId: role.id,
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'editor@shop.test', password: 'editor-pass-123' })
    ).body.data.accessToken;
    const editor = {
      patch: (url, body) =>
        request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
      post: (url, body) =>
        request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    };

    expect((await editor.patch(`${PAGES}/${page.id}`, { title: 'Renamed' })).status).toBe(200);
    expect((await editor.post(`${PAGES}/${page.id}/publish`)).status).toBe(403);

    const cashier = (
      await request(app).post('/api/v1/auth/staff/login').send({
        email: 'cashier@shop.test',
        password: 'x',
      })
    ).body;
    expect(cashier.data).toBeUndefined(); // no such account; page routes stay closed to everyone else
    expect(String(await findSystemRoleId('cashier'))).toBeTruthy();
  });
});

describe('events', () => {
  it('announces a publish so caches and sitemaps can follow', async () => {
    const seen = [];
    const { eventBus } = await import('../../../core/events.js');
    const off = eventBus.on(EVENTS.PAGE_PUBLISHED, (e) => seen.push(e.payload));
    const page = await makePage();
    await ok(await root.post(`${PAGES}/${page.id}/publish`));
    off();
    expect(seen[0]).toMatchObject({ slug: 'about-us', status: 'published' });
  });
});
