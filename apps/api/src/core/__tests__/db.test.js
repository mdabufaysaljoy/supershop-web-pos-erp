import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../test/mongo.js';
import { formatSequence, nextSequence } from '../counter.js';
import { withTransaction } from '../db.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const Probe = mongoose.models.Probe ?? mongoose.model('Probe', new mongoose.Schema({ n: Number }));

describe('withTransaction', () => {
  beforeAll(() => Probe.createCollection()); // collections can't be created inside a transaction

  it('commits and returns the callback result', async () => {
    const result = await withTransaction(async (session) => {
      await Probe.create([{ n: 1 }], { session });
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(await Probe.countDocuments()).toBe(1);
  });

  it('rolls back every write when the callback throws', async () => {
    await expect(
      withTransaction(async (session) => {
        await Probe.create([{ n: 1 }, { n: 2 }], { session, ordered: true });
        throw new Error('payment declined');
      }),
    ).rejects.toThrow('payment declined');
    expect(await Probe.countDocuments()).toBe(0);
  });
});

describe('nextSequence', () => {
  it('starts at 1 and increments per key', async () => {
    expect(await nextSequence('order')).toBe(1);
    expect(await nextSequence('order')).toBe(2);
    expect(await nextSequence('receipt:branch:1')).toBe(1);
  });

  it('is unique under concurrency (including first-use upsert race)', async () => {
    const values = await Promise.all(
      Array.from({ length: 50 }, () => nextSequence('invoice:2026')),
    );
    expect(new Set(values).size).toBe(50);
    expect(Math.max(...values)).toBe(50);
  });

  it('is gapless inside transactions: aborted increments roll back', async () => {
    await nextSequence('inv'); // 1
    await expect(
      withTransaction(async (session) => {
        await nextSequence('inv', { session });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await withTransaction((session) => nextSequence('inv', { session }))).toBe(2);
  });

  it('rejects unsafe keys', async () => {
    await expect(nextSequence('a b')).rejects.toThrow(/Invalid counter key/);
    await expect(nextSequence('$where')).rejects.toThrow(/Invalid counter key/);
  });
});

describe('formatSequence', () => {
  it('pads with a prefix', () => {
    expect(formatSequence(42, { prefix: 'INV-' })).toBe('INV-000042');
    expect(formatSequence(1234567, { pad: 3 })).toBe('1234567');
    expect(() => formatSequence(0)).toThrow(RangeError);
    expect(() => formatSequence(1.5)).toThrow(RangeError);
  });
});
