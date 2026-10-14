import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';

/**
 * The overview must answer even when Redis does not: a shop looking at Settings → Languages should
 * see its languages and usage with the queue marked unavailable, not a page that never loads.
 * The queue module is replaced here, so the behaviour is the same on any machine (CI has a Redis,
 * a laptop may not).
 */
vi.mock('../../../core/queue.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Never settles: exactly what an unreachable Redis looks like.
  inspectQueue: () => new Promise(() => {}),
}));

useMemoryMongo({ beforeAll, afterAll, afterEach });

const { getOverview } = await import('../admin.service.js');
const { seedLanguages } = await import('../languages.js');
const { loadSettings } = await import('../../settings/index.js');

beforeEach(async () => {
  await loadSettings();
  await seedLanguages();
});

describe('the languages overview when the queue is unreachable', () => {
  it('still answers, with the queue marked unavailable', async () => {
    const overview = await getOverview();
    expect(overview.queue).toBeNull();
    expect(overview.languages.length).toBeGreaterThan(0);
    expect(overview.provider).toBeTruthy();
  }, 10_000);
});
