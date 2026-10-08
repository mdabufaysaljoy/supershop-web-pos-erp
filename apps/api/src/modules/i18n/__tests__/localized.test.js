import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { loadSettings } from '../../settings/index.js';
import { processTranslationJob } from '../i18n.jobs.js';
import { clearGlossaryCache } from '../glossary.js';
import {
  localized,
  LocalizedString,
  resolveDoc,
  revertToAuto,
  setManualTranslation,
  setTranslationScheduler,
} from '../localized.plugin.js';
import { setTranslationProviderOverride } from '../translate.service.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const schema = new mongoose.Schema({
  sku: String,
  name: LocalizedString,
  seo: { title: LocalizedString },
});
schema.plugin(localized, { fields: ['name', 'seo.title'] });
const Item = mongoose.models.TestItem ?? mongoose.model('TestItem', schema);

let jobs;
let translateFn;
beforeEach(async () => {
  clearGlossaryCache();
  await loadSettings();
  jobs = [];
  setTranslationScheduler(async (job) => jobs.push(job));
  translateFn = (t) => `AR:${t}`;
  setTranslationProviderOverride({
    name: 'fake',
    enabled: true,
    translateBatch: async (texts) => texts.map((t) => translateFn(t)),
  });
});
afterAll(() => setTranslationProviderOverride(null));

const runJobs = async () => {
  const pending = jobs.splice(0);
  for (const j of pending) await processTranslationJob(j).catch(() => {});
};

describe('localized plugin', () => {
  it('schedules translation after create and the job fills Arabic + meta', async () => {
    const doc = await Item.create({
      sku: 'A1',
      name: { en: 'Blue shirt' },
      seo: { title: { en: 'Buy a blue shirt' } },
    });
    expect(jobs).toEqual([
      {
        model: 'TestItem',
        id: String(doc._id),
        items: [
          { field: 'name', lang: 'ar' },
          { field: 'seo.title', lang: 'ar' },
        ],
      },
    ]);
    expect(doc.name.meta.ar).toMatchObject({ status: 'pending', mode: 'auto' });

    await runJobs();
    const saved = await Item.findById(doc._id).lean();
    expect(saved.name.ar).toBe('AR:Blue shirt');
    expect(saved.seo.title.ar).toBe('AR:Buy a blue shirt');
    expect(saved.name.meta.ar).toMatchObject({ status: 'done', mode: 'auto', provider: 'fake' });
  });

  it('editing English marks Arabic stale but keeps serving the old Arabic until the job finishes', async () => {
    const doc = await Item.create({ name: { en: 'Blue shirt' } });
    await runJobs();
    const fresh = await Item.findById(doc._id);
    fresh.name.en = 'Navy shirt';
    await fresh.save();
    const between = await Item.findById(doc._id).lean();
    expect(between.name.ar).toBe('AR:Blue shirt'); // still served
    expect(between.name.meta.ar.status).toBe('pending');
    expect(resolveDoc(between, ['name'], 'ar').name).toBe('AR:Blue shirt');

    await runJobs();
    expect((await Item.findById(doc._id).lean()).name.ar).toBe('AR:Navy shirt');
  });

  it('saving without changing English schedules nothing', async () => {
    const doc = await Item.create({ name: { en: 'Blue shirt' } });
    await runJobs();
    const again = await Item.findById(doc._id);
    again.sku = 'B2';
    await again.save();
    expect(jobs).toHaveLength(0);
  });

  it('manual override is never overwritten by auto jobs; revert-to-auto re-translates', async () => {
    const doc = await Item.create({ name: { en: 'Blue shirt' } });
    setManualTranslation(doc, 'name', 'ar', 'HUMAN');
    await doc.save();
    await runJobs();
    expect((await Item.findById(doc._id).lean()).name.ar).toBe('HUMAN');

    const d2 = await Item.findById(doc._id);
    d2.name.en = 'Navy shirt'; // English changes but the manual lock holds
    await d2.save();
    await runJobs();
    expect((await Item.findById(doc._id).lean()).name).toMatchObject({
      ar: 'HUMAN',
      meta: { ar: { mode: 'manual' } },
    });

    const d3 = await Item.findById(doc._id);
    revertToAuto(d3, 'name', 'ar');
    await d3.save();
    await runJobs();
    expect((await Item.findById(doc._id).lean()).name.ar).toBe('AR:Navy shirt');
  });

  it('race-safe: if English changes between scheduling and processing, the stale result is not written', async () => {
    const doc = await Item.create({ name: { en: 'Blue shirt' } });
    const [job] = jobs.splice(0);
    // Admin edits English while the first job is "in flight": translation returns, then is discarded.
    translateFn = (t) => `AR:${t}`;
    const slow = processTranslationJob(job);
    await Item.updateOne({ _id: doc._id }, { $set: { 'name.en': 'Edited meanwhile' } });
    await slow.catch(() => {});
    const saved = await Item.findById(doc._id).lean();
    expect(saved.name.ar === undefined || saved.name.ar === 'AR:Edited meanwhile').toBe(true);
    expect(saved.name.ar).not.toBe('AR:Blue shirt');
  });

  it('a failed translation is marked failed (and retried by the queue), English still served', async () => {
    translateFn = () => 'garbage with no tokens';
    const doc = await Item.create({ name: { en: 'Price {amount}' } });
    await expect(processTranslationJob(jobs.splice(0)[0])).rejects.toThrow(/failed to translate/);
    const saved = await Item.findById(doc._id).lean();
    expect(saved.name.meta.ar.status).toBe('failed');
    expect(resolveDoc(saved, ['name'], 'ar').name).toBe('Price {amount}');
  });

  it('clearing English clears the translation', async () => {
    const doc = await Item.create({ name: { en: 'Blue shirt' } });
    await runJobs();
    const d = await Item.findById(doc._id);
    d.name.en = '';
    await d.save();
    expect((await Item.findById(doc._id).lean()).name.ar).toBeUndefined();
  });

  it('missing document → retryable error (job ran before the creating transaction committed)', async () => {
    const id = new mongoose.Types.ObjectId().toHexString();
    await expect(
      processTranslationJob({ model: 'TestItem', id, items: [{ field: 'name', lang: 'ar' }] }),
    ).rejects.toThrow(/not found/);
  });

  it('refuses models that do not use the plugin', async () => {
    await expect(processTranslationJob({ model: 'Setting', id: 'x', items: [] })).rejects.toThrow(
      /not localized/,
    );
  });

  it('resolveDoc handles nested fields and plain strings', () => {
    const plain = { name: { en: 'A', ar: 'B' }, seo: { title: { en: 'T' } }, other: 1 };
    expect(resolveDoc(plain, ['name', 'seo.title'], 'ar')).toEqual({
      name: 'B',
      seo: { title: 'T' },
      other: 1,
    });
    expect(resolveDoc(plain, ['name'], 'en').name).toBe('A');
  });
});
