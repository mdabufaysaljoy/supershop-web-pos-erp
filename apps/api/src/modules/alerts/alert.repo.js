import mongoose from 'mongoose';
import { Alert } from './alert.model.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

export const insertAlert = (doc) => Alert.create(doc);

/** The most recent notices this staff member is allowed to see. */
export const listRecent = (permissions, limit) =>
  Alert.find({ $or: [{ permission: null }, { permission: { $in: permissions } }] })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

export const countUnread = (permissions, staffId) =>
  Alert.countDocuments({
    $or: [{ permission: null }, { permission: { $in: permissions } }],
    readBy: { $ne: oid(staffId) },
  });

/** Marks everything this staff member can see as read, or just the ids given. */
export const markRead = (permissions, staffId, ids) =>
  Alert.updateMany(
    {
      ...(ids?.length ? { _id: { $in: ids.map(oid) } } : {}),
      $or: [{ permission: null }, { permission: { $in: permissions } }],
      readBy: { $ne: oid(staffId) },
    },
    { $addToSet: { readBy: oid(staffId) } },
  );
