/**
 * Splitting an order across the branches that fulfil online orders (pure, unit-tested).
 * Online stock is the SUM over those branches, so one order may need two of them. Branches that
 * can cover the most lines come first, so a typical order is picked from a single branch.
 *
 * @param {{ variantId: string, qty: number }[]} lines
 * @param {{ variantId: string, branchId: string, onHand: number }[]} stock
 * @returns {{ allocation: { branchId: string, lines: { variantId: string, qty: number }[] }[],
 *   short: { variantId: string, needed: number, available: number }[] }}
 */
export function allocateStock(lines, stock) {
  const byBranch = new Map();
  for (const row of stock) {
    if (row.onHand <= 0) continue;
    if (!byBranch.has(row.branchId)) byBranch.set(row.branchId, new Map());
    byBranch.get(row.branchId).set(row.variantId, row.onHand);
  }
  const remaining = new Map(lines.map((l) => [l.variantId, l.qty]));
  const order = [...byBranch.keys()].sort((a, b) => {
    const score = (id) =>
      lines.reduce((n, l) => n + Math.min(byBranch.get(id).get(l.variantId) ?? 0, l.qty), 0);
    return score(b) - score(a) || a.localeCompare(b);
  });

  const allocation = [];
  for (const branchId of order) {
    const take = [];
    for (const [variantId, need] of remaining) {
      if (need <= 0) continue;
      const have = byBranch.get(branchId).get(variantId) ?? 0;
      const qty = Math.min(need, have);
      if (qty > 0) {
        take.push({ variantId, qty });
        remaining.set(variantId, need - qty);
      }
    }
    if (take.length) allocation.push({ branchId, lines: take });
    if ([...remaining.values()].every((n) => n <= 0)) break;
  }

  const total = (variantId) =>
    stock.reduce((n, r) => (r.variantId === variantId ? n + Math.max(0, r.onHand) : n), 0);
  const short = lines
    .filter((l) => (remaining.get(l.variantId) ?? 0) > 0)
    .map((l) => ({ variantId: l.variantId, needed: l.qty, available: total(l.variantId) }));
  return { allocation: short.length ? [] : allocation, short };
}
