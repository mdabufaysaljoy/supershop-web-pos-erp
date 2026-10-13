import { CATEGORY } from '@supershop/shared';
import { Category } from './category.model.js';

const ACTIVE = { deletedAt: null };
const opts = (session) => (session ? { session } : {});

/** Every non-deleted category, parents before children, siblings in order. */
export const listActive = () =>
  Category.find(ACTIVE).sort({ depth: 1, position: 1, _id: 1 }).lean();

export const findActiveByIds = (ids) => Category.find({ _id: { $in: ids }, ...ACTIVE }).lean();
export const findActiveById = (id, session) =>
  Category.findOne({ _id: id, ...ACTIVE }, null, opts(session)).lean();
export const slugExists = async (slug, excludeId) =>
  Boolean(
    await Category.exists({ slug, ...ACTIVE, ...(excludeId && { _id: { $ne: excludeId } }) }),
  );

export const countActiveChildren = (parentId, session) =>
  Category.countDocuments({ parentId, ...ACTIVE }, opts(session));

/** Siblings under `parentId` (null = top level) in display order: `[{ _id, position }]`. */
export const listSiblings = (parentId, session) =>
  Category.find({ parentId, ...ACTIVE }, { _id: 1, position: 1 }, opts(session))
    .sort({ position: 1, _id: 1 })
    .lean();

/** Deepest level inside the subtree of `id` (null when it has no descendants). */
export async function maxDescendantDepth(id, session) {
  const deepest = await Category.findOne({ ancestors: id, ...ACTIVE }, { depth: 1 }, opts(session))
    .sort({ depth: -1 })
    .lean();
  return deepest?.depth ?? null;
}

/** `save()` so the localized plugin schedules translation. */
export const createCategory = (data, session) =>
  new Category(data).save(opts(session)).then((d) => d.toObject());

export const loadForUpdate = (id) => Category.findOne({ _id: id, ...ACTIVE });
export const saveDoc = (doc) => doc.save().then((d) => d.toObject());

/** Writes `position = index` for the given ordered ids (only rows whose value changes). */
export async function writePositions(orderedIds, current, session) {
  const ops = orderedIds
    .map((id, position) => ({ id, position }))
    .filter(({ id, position }) => current.get(String(id)) !== position)
    .map(({ id, position }) => ({
      updateOne: { filter: { _id: id }, update: { $set: { position } } },
    }));
  if (ops.length) await Category.bulkWrite(ops, opts(session));
}

/**
 * Re-parents `id` and rewrites the path of its whole subtree in two statements:
 * descendants' ancestors = newAncestors + [id] + (their part below id); depth shifts by the delta.
 */
export async function reparent(node, { parentId, ancestors, depth }, session) {
  await Category.updateOne(
    { _id: node._id },
    { $set: { parentId, ancestors, depth } },
    opts(session),
  );
  await Category.updateMany(
    { ancestors: node._id },
    [
      {
        $set: {
          ancestors: {
            $concatArrays: [
              [...ancestors, node._id],
              { $slice: ['$ancestors', node.ancestors.length + 1, CATEGORY.MAX_DEPTH + 1] },
            ],
          },
          depth: { $add: ['$depth', depth - node.depth] },
        },
      },
    ],
    { ...opts(session), updatePipeline: true },
  );
}

export const softDelete = (id, session) =>
  Category.updateOne({ _id: id, ...ACTIVE }, { $set: { deletedAt: new Date() } }, opts(session));
