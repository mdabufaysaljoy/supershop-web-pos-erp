import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeAr } from '../../../../test/fakeArabic.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { nextEvent } from '../../../../test/http.js';
import { EVENTS } from '@supershop/shared';
import { getCounterValue } from '../../../core/counter.js';
import { loadSettings } from '../../settings/index.js';
import { Setting } from '../../settings/settings.model.js';
import { bumpGlossaryVersion, clearGlossaryCache } from '../glossary.js';
import { GlossaryTerm, Translation } from '../i18n.model.js';
import { _breakerState, setTranslationProviderOverride, translate } from '../translate.service.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

/** Deterministic fake provider: Arabic-script transliteration of the masked text (tokens untouched). */
function fakeProvider(transform = fakeAr) {
  const calls = [];
  return {
    calls,
    name: 'fake',
    enabled: true,
    async translateBatch(texts) {
      calls.push(texts);
      return texts.map(transform);
    },
  };
}

let provider;
beforeEach(async () => {
  clearGlossaryCache();
  await loadSettings();
  provider = fakeProvider();
  setTranslationProviderOverride(provider);
});
afterAll(() => setTranslationProviderOverride(null));

describe('translate()', () => {
  it('translates, keeps order, dedupes identical strings and leaves empties alone', async () => {
    const { results } = await translate({
      texts: ['Add to cart', '', 'Blue', 'Add to cart'],
      to: 'ar',
    });
    expect(results).toEqual([fakeAr('Add to cart'), '', fakeAr('Blue'), fakeAr('Add to cart')]);
    expect(provider.calls.flat()).toEqual(['Add to cart', 'Blue']); // sent once each
  });

  it('protects placeholders/numbers/HTML end-to-end', async () => {
    const { results } = await translate({ texts: ['<b>Save {amount}</b> on 2 items'], to: 'ar' });
    expect(results[0]).toBe(
      `<b>${fakeAr('Save')} {amount}</b> ${fakeAr('on')} 2 ${fakeAr('items')}`,
    );
    const sent = provider.calls[0][0];
    expect(sent.replace(/\[\d+\]/g, '')).not.toMatch(/<b>|\{amount\}|\d/); // provider never saw them
    expect(sent).toMatch(/Save/);
  });

  it('does not call the provider for text with nothing translatable', async () => {
    const { results } = await translate({ texts: ['TSH-01 199.99'], to: 'ar' });
    expect(results).toEqual(['TSH-01 199.99']);
    expect(provider.calls).toHaveLength(0);
  });

  it('caches in Mongo: second call hits the cache, not the provider', async () => {
    await translate({ texts: ['Free delivery'], to: 'ar' });
    await translate({ texts: ['Free delivery'], to: 'ar' });
    expect(provider.calls).toHaveLength(1);
    expect(await Translation.countDocuments()).toBe(1);
  });

  it('glossary: do-not-translate and preferred pairs; a glossary change invalidates the cache', async () => {
    await translate({ texts: ['Pay with Mada'], to: 'ar' });
    await GlossaryTerm.create({ term: 'Mada', termKey: 'mada', doNotTranslate: true });
    await bumpGlossaryVersion();
    const { results } = await translate({ texts: ['Pay with Mada'], to: 'ar' });
    expect(results[0]).toBe(`${fakeAr('Pay with')} Mada`);
    expect(provider.calls).toHaveLength(2); // new glossary version → not served from old cache
    expect(provider.calls[1][0]).not.toContain('Mada');

    await GlossaryTerm.create({
      term: 'Buy now',
      termKey: 'buy now',
      targets: { ar: 'PREFERRED' },
    });
    await bumpGlossaryVersion();
    expect((await translate({ texts: ['Buy now'], to: 'ar' })).results[0]).toBe('PREFERRED');
  });

  it('rejects provider output that mangles placeholders or injects markup (keeps null)', async () => {
    setTranslationProviderOverride(fakeProvider(() => 'dropped all tokens'));
    expect((await translate({ texts: ['Hello {name}'], to: 'ar' })).results).toEqual([null]);
    setTranslationProviderOverride(fakeProvider((t) => `${fakeAr(t)}<script>`));
    expect((await translate({ texts: ['Hello there'], to: 'ar' })).results).toEqual([null]);
    setTranslationProviderOverride(fakeProvider((t) => t)); // engine returned English untouched
    expect((await translate({ texts: ['Hello there'], to: 'ar' })).results).toEqual([null]);
    expect(await Translation.countDocuments()).toBe(0); // nothing bad was cached
  });

  it('batches large inputs', async () => {
    const texts = Array.from(
      { length: 60 },
      (_, i) => `Item word ${String.fromCharCode(65 + (i % 26))}${i}x`,
    );
    await translate({ texts, to: 'ar' });
    expect(provider.calls.length).toBeGreaterThanOrEqual(3);
    expect(provider.calls.every((b) => b.length <= 25)).toBe(true);
  });

  it('noop provider → disabled, results null, nothing stored', async () => {
    setTranslationProviderOverride({
      name: 'noop',
      enabled: false,
      translateBatch: async () => [],
    });
    const out = await translate({ texts: ['Hello'], to: 'ar' });
    expect(out).toMatchObject({ disabled: true, results: [null] });
  });

  it('budget guard stops calls beyond the monthly character budget and emits an alert', async () => {
    await Setting.create({ key: 'i18n.monthlyCharBudget', value: 10 });
    await loadSettings();
    const alert = nextEvent(EVENTS.TRANSLATION_BUDGET_EXCEEDED);
    expect((await translate({ texts: ['short'], to: 'ar' })).results).toEqual([fakeAr('short')]);
    expect((await translate({ texts: ['this one is far too long'], to: 'ar' })).results).toEqual([
      null,
    ]);
    await expect(alert).resolves.toBeDefined();
    const month = new Date().toISOString().slice(0, 7);
    expect(await getCounterValue(`i18n:chars:${month}`)).toBe(5);
  });

  it('circuit breaker opens after repeated provider failures (fails fast, returns null)', async () => {
    let n = 0;
    setTranslationProviderOverride({
      name: 'down',
      enabled: true,
      async translateBatch() {
        n += 1;
        throw new Error('ECONNREFUSED');
      },
    });
    for (let i = 0; i < 7; i += 1)
      expect((await translate({ texts: [`Word number${i}`], to: 'ar' })).results).toEqual([null]);
    expect(n).toBe(5); // calls 6 and 7 never reached the provider
    expect(_breakerState()).toBe('open');
  });
});
