import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../test/mongo.js';
import { ensureAllIndexes, loadAllModels } from '../ensureIndexes.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

describe('ensureAllIndexes', () => {
  it('loads all application models and syncs indexes without errors', async () => {
    await loadAllModels();
    const result = await ensureAllIndexes();

    expect(result.totalModels).toBeGreaterThan(30);
    expect(result.syncedModels.length).toBe(result.totalModels);
    expect(result.errors).toEqual([]);
    expect(result.syncedModels).toContain('Order');
    expect(result.syncedModels).toContain('Product');
    expect(result.syncedModels).toContain('Variant');
    expect(result.syncedModels).toContain('Customer');
    expect(result.syncedModels).toContain('StockMovement');
  });
});
