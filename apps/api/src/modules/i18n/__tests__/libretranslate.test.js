import { describe, expect, it, vi } from 'vitest';
import { createLibreTranslateProvider } from '../../../adapters/translation/libretranslate.js';
import { createTranslationProvider } from '../../../adapters/translation/index.js';

const ok = (text) => new Response(JSON.stringify({ translatedText: text }), { status: 200 });

describe('LibreTranslate adapter', () => {
  it('sends the documented request shape and preserves order', async () => {
    const fetchImpl = vi.fn(async (_url, init) => ok(`T(${JSON.parse(init.body).q})`));
    const p = createLibreTranslateProvider({ baseUrl: 'http://lt:5000/', apiKey: 'k1', fetchImpl });
    expect(await p.translateBatch(['a', 'b', 'c'], { from: 'en', to: 'ar' })).toEqual([
      'T(a)',
      'T(b)',
      'T(c)',
    ]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://lt:5000/translate');
    expect(JSON.parse(init.body)).toEqual({
      q: 'a',
      source: 'en',
      target: 'ar',
      format: 'text',
      api_key: 'k1',
    });
  });

  it('omits api_key when not configured', async () => {
    const fetchImpl = vi.fn(async () => ok('x'));
    await createLibreTranslateProvider({ baseUrl: 'http://lt', fetchImpl }).translateBatch(['a'], {
      from: 'en',
      to: 'ar',
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('api_key');
  });

  it('retries transient errors with backoff, not client errors', async () => {
    let n = 0;
    const flaky = vi.fn(async () => (++n < 3 ? new Response('busy', { status: 503 }) : ok('done')));
    const p = createLibreTranslateProvider({
      baseUrl: 'http://lt',
      fetchImpl: flaky,
      backoffMs: 1,
    });
    expect(await p.translateBatch(['a'], { from: 'en', to: 'ar' })).toEqual(['done']);
    expect(flaky).toHaveBeenCalledTimes(3);

    const bad = vi.fn(async () => new Response('{"error":"bad"}', { status: 400 }));
    const p2 = createLibreTranslateProvider({ baseUrl: 'http://lt', fetchImpl: bad, backoffMs: 1 });
    await expect(p2.translateBatch(['a'], { from: 'en', to: 'ar' })).rejects.toMatchObject({
      status: 400,
      retryable: false,
    });
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('treats an unexpected body as an error and reports health', async () => {
    const weird = vi.fn(async () => new Response('{"nope":1}', { status: 200 }));
    await expect(
      createLibreTranslateProvider({ baseUrl: 'http://lt', fetchImpl: weird }).translateBatch(
        ['a'],
        { from: 'en', to: 'ar' },
      ),
    ).rejects.toThrow(/unexpected body/);
    const down = vi.fn(async () => {
      throw new TypeError('ECONNREFUSED');
    });
    expect(
      await createLibreTranslateProvider({ baseUrl: 'http://lt', fetchImpl: down }).health(),
    ).toBe(false);
  });

  it('registry: noop by default, libretranslate when selected', () => {
    expect(createTranslationProvider({ provider: 'noop' }).enabled).toBe(false);
    expect(
      createTranslationProvider({ provider: 'libretranslate', libretranslateUrl: 'http://lt' })
        .name,
    ).toBe('libretranslate');
  });
});
