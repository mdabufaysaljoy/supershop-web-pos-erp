import { TrackingEventLog } from './trackingLog.model.js';

export async function createLog(data) {
  const log = new TrackingEventLog(data);
  return log.save();
}

export async function updateLog(id, update) {
  return TrackingEventLog.findByIdAndUpdate(
    id,
    { $set: update },
    { returnDocument: 'after' },
  ).lean();
}

export async function findLogById(id) {
  return TrackingEventLog.findById(id).lean();
}

export async function findLogByEvent(provider, event, eventId) {
  return TrackingEventLog.findOne({ provider, event, eventId }).lean();
}

export async function queryLogs({
  provider,
  event,
  status,
  search,
  from,
  to,
  page = 1,
  limit = 20,
} = {}) {
  const filter = {};

  if (provider) filter.provider = provider;
  if (event) filter.event = event;
  if (status) filter.status = status;

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { orderNumber: { $regex: escaped, $options: 'i' } },
      { eventId: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    TrackingEventLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TrackingEventLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}
