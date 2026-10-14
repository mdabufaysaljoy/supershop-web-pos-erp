import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blockTypes } from '@supershop/shared';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Page } from '../page.model.js';
import { HOME_TEMPLATE, seedHomePage } from '../page.seed.js';

/** P5.6 — the home page a fresh shop starts with: ordinary blocks, published, and editable. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
let app;
let rootToken;
const scheduled = [];

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

beforeEach(async () => {
  scheduled.length = 0;
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

describe('the starting home page', () => {
  it('is built only from blocks the shop can edit', () => {
    const known = new Set(blockTypes());
    for (const block of HOME_TEMPLATE.blocks) expect(known).toContain(block.type);
    expect(HOME_TEMPLATE.blocks.map((b) => b.type)).toEqual([
      'heroCarousel',
      'categoryGrid',
      'productRail',
      'productRail',
      'features',
      'banner',
      'newsletter',
    ]);
  });

  it('is created published, is the home page, and its text is queued for translation', async () => {
    const created = await seedHomePage();
    expect(created).toEqual({ slug: 'home', blocks: HOME_TEMPLATE.blocks.length });

    const page = await Page.findOne({ isHome: true }).lean();
    expect(page.status).toBe('published');
    expect(page.published.blocks).toHaveLength(HOME_TEMPLATE.blocks.length);
    expect(page.publishedAt).toBeInstanceOf(Date);
    // The hero's headline and the rail headings are content like any other (§5.7).
    expect(page.texts.map((t) => t.key)).toContain('home-hero.slides.0.heading');
    expect(scheduled.flatMap((j) => j.items.map((i) => i.field))).toContain('texts.0.value');
  });

  it('leaves the published copy alone when the builder edits the draft', async () => {
    await seedHomePage();
    const page = await Page.findOne({ isHome: true }).lean();
    const edited = structuredClone(HOME_TEMPLATE.blocks);
    edited[0].props.slides[0].heading = 'Our own headline';
    await ok(
      await request(app)
        .patch(`/api/v1/pages/${page._id}`)
        .set('Authorization', `Bearer ${rootToken}`)
        .send({ draft: { blocks: edited } }),
    );
    const after = await Page.findById(page._id).lean();
    expect(after.draft.blocks[0].props.slides[0].heading).toBe('Our own headline');
    expect(after.published.blocks[0].props.slides[0].heading).toBe(
      HOME_TEMPLATE.blocks[0].props.slides[0].heading,
    );
  });

  it('never touches a home page the shop already has', async () => {
    await seedHomePage();
    await Page.updateOne({ isHome: true }, { $set: { 'draft.blocks': [] } });
    expect(await seedHomePage()).toBeNull();
    expect(await Page.countDocuments({})).toBe(1);
    expect((await Page.findOne({ isHome: true }).lean()).draft.blocks).toEqual([]);
  });

  it('is what a visitor gets at the home address, with its blocks resolved', async () => {
    await seedHomePage();
    const live = await ok(await request(app).get('/api/v1/pages/public/home?lang=en'));
    expect(live.content.blocks[0].type).toBe('heroCarousel');
    // The catalogue is empty here, but the rails were resolved rather than left to the browser.
    expect(live.data['home-newest']).toEqual({ products: [] });
    expect(live.data['home-categories']).toEqual({ categories: [] });
  });
});
