import { Campaign, CampaignDelivery } from './campaign.model.js';

export async function insertCampaign(data) {
  const doc = new Campaign(data);
  return doc.save();
}

export async function findCampaignById(id) {
  return Campaign.findById(id);
}

export async function updateCampaign(id, mutateFn) {
  const doc = await Campaign.findById(id);
  if (!doc) return null;
  mutateFn(doc);
  return doc.save();
}

export async function listCampaigns(
  filter = {},
  { skip = 0, limit = 20, sort = { createdAt: -1 } } = {},
) {
  const query = {};
  if (filter.channel) query.channel = filter.channel;
  if (filter.status) query.status = filter.status;
  if (filter.segment) query.segment = filter.segment;
  if (filter.q) {
    query.name = { $regex: filter.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Campaign.find(query).sort(sort).skip(skip).limit(limit).lean(),
    Campaign.countDocuments(query),
  ]);

  return { items, total };
}

export async function insertDeliveryLogs(logs) {
  if (!logs?.length) return [];
  return CampaignDelivery.insertMany(logs, { ordered: false }).catch((err) => {
    // If some duplicate or bulk write error occurs, return whatever was written
    return err.insertedDocs ?? [];
  });
}

export async function listDeliveries(campaignId, { skip = 0, limit = 50 } = {}) {
  const [items, total] = await Promise.all([
    CampaignDelivery.find({ campaignId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CampaignDelivery.countDocuments({ campaignId }),
  ]);
  return { items, total };
}
