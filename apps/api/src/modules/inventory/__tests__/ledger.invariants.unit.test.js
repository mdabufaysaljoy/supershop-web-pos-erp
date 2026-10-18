import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { withTransaction } from '../../../core/db.js';
import { Branch } from '../../branches/branch.model.js';
import { Product, Variant } from '../../products/product.model.js';
import { adjustStock, applyStockOperation } from '../inventory.service.js';
import { StockLevel, StockMovement, StockOperation } from '../stock.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

describe('Stock Ledger Invariants (P10.2 Unit Suite)', () => {
  let branchId;
  let toBranchId;
  let productId;
  let variantId;
  const actorId = new mongoose.Types.ObjectId();

  const setupFixtures = async () => {
    const b1 = await Branch.create({ code: `B1-${Date.now()}`, name: { en: 'Branch 1' } });
    const b2 = await Branch.create({ code: `B2-${Date.now()}`, name: { en: 'Branch 2' } });
    branchId = b1._id;
    toBranchId = b2._id;

    const prod = await Product.create({
      name: { en: 'Test Product' },
      slug: `test-prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'active',
    });
    productId = prod._id;

    const v = await Variant.create({
      productId,
      sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      price: 10000,
      cost: 5000,
      isActive: true,
    });
    variantId = v._id;

    return { b1, b2, prod, v };
  };

  it('enforces append-only immutability on StockMovement model', async () => {
    await setupFixtures();

    // Insert a valid initial movement
    const op = await StockOperation.create({
      type: 'receive',
      docNo: 'GRN-000001',
      branchId,
      lineCount: 1,
      actorId,
    });

    const m = await StockMovement.create({
      operationId: op._id,
      type: 'receive',
      variantId,
      productId,
      branchId,
      delta: 10,
      balanceAfter: 10,
      actorId,
    });

    expect(m._id).toBeDefined();

    // Verify all update/delete methods are blocked by append-only middleware
    await expect(StockMovement.updateOne({ _id: m._id }, { delta: 20 })).rejects.toThrow(
      'Stock movements are append-only',
    );
    await expect(StockMovement.updateMany({}, { delta: 0 })).rejects.toThrow(
      'Stock movements are append-only',
    );
    await expect(StockMovement.findOneAndUpdate({ _id: m._id }, { delta: 15 })).rejects.toThrow(
      'Stock movements are append-only',
    );
    await expect(StockMovement.replaceOne({ _id: m._id }, { delta: 5 })).rejects.toThrow(
      'Stock movements are append-only',
    );
    await expect(StockMovement.deleteOne({ _id: m._id })).rejects.toThrow(
      'Stock movements are append-only',
    );
    await expect(StockMovement.deleteMany({})).rejects.toThrow('Stock movements are append-only');
    await expect(StockMovement.findByIdAndDelete(m._id)).rejects.toThrow(
      'Stock movements are append-only',
    );
  });

  it('preserves running balance continuity across multiple stock operations', async () => {
    const { v } = await setupFixtures();
    const vId = v._id;
    const pId = productId;

    // 1. Initial Receipt: +20
    const r1 = await withTransaction((session) =>
      applyStockOperation(
        {
          type: 'receive',
          branchId: branchId.toString(),
          lines: [
            { variantId: vId.toString(), productId: pId.toString(), qty: 20, unitCost: 5000 },
          ],
          actorId: actorId.toString(),
        },
        { session },
      ),
    );
    expect(r1.movements[0].balanceAfter).toBe(20);

    // 2. Sale: -6
    const r2 = await withTransaction((session) =>
      applyStockOperation(
        {
          type: 'sale',
          branchId: branchId.toString(),
          lines: [{ variantId: vId.toString(), productId: pId.toString(), qty: 6 }],
          actorId: actorId.toString(),
        },
        { session },
      ),
    );
    expect(r2.movements[0].balanceAfter).toBe(14);

    // 3. Customer Return: +2
    const r3 = await withTransaction((session) =>
      applyStockOperation(
        {
          type: 'return',
          branchId: branchId.toString(),
          lines: [{ variantId: vId.toString(), productId: pId.toString(), qty: 2 }],
          actorId: actorId.toString(),
        },
        { session },
      ),
    );
    expect(r3.movements[0].balanceAfter).toBe(16);

    // 4. Adjustment down: -3
    const r4 = await withTransaction((session) =>
      applyStockOperation(
        {
          type: 'adjust',
          branchId: branchId.toString(),
          lines: [{ variantId: vId.toString(), productId: pId.toString(), delta: -3 }],
          actorId: actorId.toString(),
          reason: 'damaged',
        },
        { session },
      ),
    );
    expect(r4.movements[0].balanceAfter).toBe(13);

    // 5. Transfer to another branch: -5 from source, +5 to destination
    const r5 = await withTransaction((session) =>
      applyStockOperation(
        {
          type: 'transfer',
          branchId: branchId.toString(),
          toBranchId: toBranchId.toString(),
          lines: [{ variantId: vId.toString(), productId: pId.toString(), qty: 5 }],
          actorId: actorId.toString(),
        },
        { session },
      ),
    );

    // Source movement should be -5 with balance 8
    const srcMv = r5.movements.find((m) => m.branchId.toString() === branchId.toString());
    expect(srcMv.delta).toBe(-5);
    expect(srcMv.balanceAfter).toBe(8);

    // Dest movement should be +5 with balance 5
    const dstMv = r5.movements.find((m) => m.branchId.toString() === toBranchId.toString());
    expect(dstMv.delta).toBe(5);
    expect(dstMv.balanceAfter).toBe(5);

    // Verify stock_levels matches sum of movements
    const srcLevel = await StockLevel.findOne({ variantId: vId, branchId }).lean();
    expect(srcLevel.onHand).toBe(8);

    const dstLevel = await StockLevel.findOne({ variantId: vId, branchId: toBranchId }).lean();
    expect(dstLevel.onHand).toBe(5);

    // Verify every ledger row continuity: balanceAfter = previous + delta
    const movements = await StockMovement.find({ variantId: vId, branchId })
      .sort({ _id: 1 })
      .lean();
    let prev = 0;
    for (const row of movements) {
      expect(row.balanceAfter).toBe(prev + row.delta);
      prev = row.balanceAfter;
    }
  });

  it('rejects stock operation when on-hand is insufficient and aborts transaction', async () => {
    const { v } = await setupFixtures();
    const vId = v._id;
    const pId = productId;

    // Seed 3 units
    await withTransaction((session) =>
      applyStockOperation(
        {
          type: 'receive',
          branchId: branchId.toString(),
          lines: [{ variantId: vId.toString(), productId: pId.toString(), qty: 3 }],
          actorId: actorId.toString(),
        },
        { session },
      ),
    );

    // Attempt to sell 5 units
    await expect(
      withTransaction((session) =>
        applyStockOperation(
          {
            type: 'sale',
            branchId: branchId.toString(),
            lines: [{ variantId: vId.toString(), productId: pId.toString(), qty: 5 }],
            actorId: actorId.toString(),
          },
          { session },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 409,
    });

    // Level must remain 3 and no sale movement should exist
    const lvl = await StockLevel.findOne({ variantId: vId, branchId }).lean();
    expect(lvl.onHand).toBe(3);

    const sales = await StockMovement.find({ variantId: vId, type: 'sale' }).lean();
    expect(sales).toHaveLength(0);
  });

  it('enforces idempotency on operations with duplicate idempotency keys', async () => {
    const { v } = await setupFixtures();
    const vId = v._id;
    const key = `actor-123:test-idempotency-key-${Date.now()}`;
    const actor = {
      staffId: actorId.toString(),
      assertBranch: () => true,
      can: () => true,
    };

    const input = {
      branchId: branchId.toString(),
      lines: [{ variantId: vId.toString(), delta: 15 }],
      reason: 'inventory audit',
    };

    const first = await adjustStock(actor, input, key);
    expect(first.replayed).toBe(false);

    // Second call with same idempotency key
    const second = await adjustStock(actor, input, key);
    expect(second.replayed).toBe(true);
    expect(second.id.toString()).toBe(first.id.toString());

    // Verify only 1 movement and stock level is 15 (not 30)
    const level = await StockLevel.findOne({ variantId: vId, branchId }).lean();
    expect(level.onHand).toBe(15);

    const movements = await StockMovement.find({ variantId: vId }).lean();
    expect(movements).toHaveLength(1);
  });
});
