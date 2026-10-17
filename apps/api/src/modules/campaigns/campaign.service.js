import {
  EVENTS,
  interpolateCampaignTemplate,
  resolveLocalized,
  SOURCE_LANGUAGE,
} from '@supershop/shared';
import { config } from '../../core/config.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import {
  countAudienceForCampaign,
  findAudienceForCampaign,
  setCustomerMarketingOptOut,
} from '../customers/index.js';
import { getNotificationProviders } from '../notifications/index.js';
import { cancelCampaignJob, queueCampaignDispatch } from './campaign.jobs.js';
import * as repo from './campaign.repo.js';
import { createUnsubscribeToken, verifyUnsubscribeToken } from './campaign.unsubscribeToken.js';

export const toCampaignDto = (c) => ({
  id: String(c._id),
  name: c.name,
  channel: c.channel,
  segment: c.segment,
  status: c.status,
  subject: c.subject,
  message: c.message,
  scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
  startedAt: c.startedAt ? c.startedAt.toISOString() : null,
  completedAt: c.completedAt ? c.completedAt.toISOString() : null,
  stats: c.stats ?? { targeted: 0, sent: 0, failed: 0, skipped: 0 },
  jobId: c.jobId ?? null,
  createdBy: c.createdBy ? String(c.createdBy) : null,
  createdAt: c.createdAt ? c.createdAt.toISOString() : null,
  updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
});

/**
 * Creates a new marketing campaign in draft or scheduled state.
 */
export async function createCampaign(input, staffId) {
  const isScheduled = Boolean(input.scheduledAt);
  const scheduledDate = isScheduled ? new Date(input.scheduledAt) : null;

  const doc = await repo.insertCampaign({
    name: input.name,
    channel: input.channel,
    segment: input.segment,
    subject: input.subject ? { [SOURCE_LANGUAGE]: input.subject } : {},
    message: { [SOURCE_LANGUAGE]: input.message },
    status: isScheduled ? 'scheduled' : 'draft',
    scheduledAt: scheduledDate,
    createdBy: staffId ?? null,
  });

  if (isScheduled && scheduledDate) {
    const delay = scheduledDate.getTime() - Date.now();
    const jobId = `campaign-${doc._id}-${scheduledDate.getTime()}`;
    await queueCampaignDispatch(String(doc._id), { delay, jobId });
    await repo.updateCampaign(doc._id, (d) => {
      d.jobId = jobId;
    });
    void eventBus.emit(EVENTS.CAMPAIGN_SCHEDULED, {
      campaignId: String(doc._id),
      scheduledAt: doc.scheduledAt,
      channel: doc.channel,
    });
  } else {
    void eventBus.emit(EVENTS.CAMPAIGN_CREATED, {
      campaignId: String(doc._id),
      channel: doc.channel,
      segment: doc.segment,
    });
  }

  return toCampaignDto(await repo.findCampaignById(doc._id));
}

/**
 * Updates an existing campaign if it is still in draft or scheduled state.
 */
export async function updateCampaign(id, patch) {
  const existing = await repo.findCampaignById(id);
  if (!existing) throw new NotFoundError('Campaign not found');

  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    throw new ConflictError(
      `Cannot modify a campaign in '${existing.status}' status (must be draft or scheduled)`,
    );
  }

  let newJobId = existing.jobId;

  if (patch.scheduledAt !== undefined) {
    // If scheduled time changed, cancel previous job
    if (existing.jobId) {
      await cancelCampaignJob(existing.jobId);
      newJobId = null;
    }

    if (patch.scheduledAt) {
      const scheduledDate = new Date(patch.scheduledAt);
      const delay = scheduledDate.getTime() - Date.now();
      newJobId = `campaign-${existing._id}-${scheduledDate.getTime()}`;
      await queueCampaignDispatch(String(existing._id), { delay, jobId: newJobId });
    }
  }

  const updated = await repo.updateCampaign(id, (doc) => {
    if (patch.name !== undefined) doc.name = patch.name;
    if (patch.channel !== undefined) doc.channel = patch.channel;
    if (patch.segment !== undefined) doc.segment = patch.segment;
    if (patch.subject !== undefined) {
      doc.set(`subject.${SOURCE_LANGUAGE}`, patch.subject || '');
    }
    if (patch.message !== undefined) {
      doc.set(`message.${SOURCE_LANGUAGE}`, patch.message);
    }
    if (patch.scheduledAt !== undefined) {
      doc.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
      doc.status = patch.scheduledAt ? 'scheduled' : 'draft';
      doc.jobId = newJobId;
    }
  });

  return toCampaignDto(updated);
}

/**
 * Returns a campaign by ID.
 */
export async function getCampaign(id) {
  const doc = await repo.findCampaignById(id);
  if (!doc) throw new NotFoundError('Campaign not found');
  return toCampaignDto(doc);
}

/**
 * Lists campaigns with filters and pagination.
 */
export async function listCampaigns({
  page = 1,
  limit = 20,
  sort = '-createdAt',
  channel,
  status,
  segment,
  q,
} = {}) {
  let sortObj = { createdAt: -1 };
  if (sort) {
    if (typeof sort === 'object' && sort.field) {
      sortObj = { [sort.field]: sort.direction };
    } else if (typeof sort === 'string') {
      if (sort.startsWith('-')) {
        sortObj = { [sort.slice(1)]: -1 };
      } else {
        sortObj = { [sort]: 1 };
      }
    }
  }

  const filter = {
    ...(channel && { channel }),
    ...(status && { status }),
    ...(segment && { segment }),
    ...(q && { q }),
  };

  const { items, total } = await repo.listCampaigns(filter, {
    skip: (page - 1) * limit,
    limit,
    sort: sortObj,
  });

  return {
    data: items.map(toCampaignDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Returns the audience count for a given segment and channel.
 */
export async function getAudienceCount(segment, channel) {
  const count = await countAudienceForCampaign({ segment, channel });
  return { count };
}

/**
 * Schedules a draft or scheduled campaign for a future date.
 */
export async function scheduleCampaign(id, scheduledAt, staffId) {
  const existing = await repo.findCampaignById(id);
  if (!existing) throw new NotFoundError('Campaign not found');

  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    throw new ConflictError(`Cannot schedule a campaign with status '${existing.status}'`);
  }

  const scheduledDate = new Date(scheduledAt);
  const delay = scheduledDate.getTime() - Date.now();
  if (delay <= 0) {
    throw new ValidationError('Scheduled date must be in the future');
  }

  if (existing.jobId) {
    await cancelCampaignJob(existing.jobId);
  }

  const jobId = `campaign-${existing._id}-${scheduledDate.getTime()}`;
  await queueCampaignDispatch(String(existing._id), { delay, jobId });

  const updated = await repo.updateCampaign(id, (doc) => {
    doc.status = 'scheduled';
    doc.scheduledAt = scheduledDate;
    doc.jobId = jobId;
  });

  void eventBus.emit(EVENTS.CAMPAIGN_SCHEDULED, {
    campaignId: String(updated._id),
    scheduledAt: updated.scheduledAt,
    channel: updated.channel,
    staffId,
  });

  return toCampaignDto(updated);
}

/**
 * Cancels a scheduled campaign.
 */
export async function cancelCampaign(id, staffId) {
  const existing = await repo.findCampaignById(id);
  if (!existing) throw new NotFoundError('Campaign not found');

  if (existing.status !== 'scheduled' && existing.status !== 'draft') {
    throw new ConflictError(`Cannot cancel a campaign with status '${existing.status}'`);
  }

  if (existing.jobId) {
    await cancelCampaignJob(existing.jobId);
  }

  const updated = await repo.updateCampaign(id, (doc) => {
    doc.status = 'cancelled';
    doc.jobId = null;
  });

  void eventBus.emit(EVENTS.CAMPAIGN_CANCELLED, {
    campaignId: String(updated._id),
    channel: updated.channel,
    staffId,
  });

  return toCampaignDto(updated);
}

/**
 * Sends a campaign immediately.
 */
export async function sendCampaign(id, staffId, { inline = false } = {}) {
  const existing = await repo.findCampaignById(id);
  if (!existing) throw new NotFoundError('Campaign not found');

  if (existing.status !== 'draft' && existing.status !== 'scheduled') {
    throw new ConflictError(`Cannot send a campaign with status '${existing.status}'`);
  }

  if (existing.jobId) {
    await cancelCampaignJob(existing.jobId);
  }

  await repo.updateCampaign(id, (doc) => {
    doc.status = 'sending';
    doc.startedAt = new Date();
    doc.jobId = null;
  });

  if (inline) {
    await executeCampaignDispatch(id);
  } else {
    await queueCampaignDispatch(String(id), { delay: 0 });
  }

  return toCampaignDto(await repo.findCampaignById(id));
}

/**
 * Sends a test message to a specified address or phone number.
 */
export async function sendTestCampaign({ id, channel, to, lang = SOURCE_LANGUAGE }) {
  const campaign = await repo.findCampaignById(id);
  if (!campaign) throw new NotFoundError('Campaign not found');

  const provider = getNotificationProviders()[channel];
  if (!provider?.enabled) {
    throw new ValidationError(`Provider for channel '${channel}' is not configured or enabled`);
  }

  const localizedSubject = resolveLocalized(campaign.subject, lang);
  const localizedMessage = resolveLocalized(campaign.message, lang);

  const testVars = {
    customer: { name: 'Test Customer', email: to, phone: to },
    store: { name: 'SuperShop' },
    unsubscribe_url: `${config.API_PUBLIC_URL}/api/v1/campaigns/unsubscribe?demo=1`,
  };

  const subject = interpolateCampaignTemplate(localizedSubject, testVars);
  const text = interpolateCampaignTemplate(localizedMessage, testVars);

  const result = await provider.send({ to, subject, text });
  return { status: 'sent', channel, to, providerRef: result?.id ?? null };
}

/**
 * Executes campaign dispatch to all targeted audience members.
 * Called by the background queue worker or inline in test runs.
 */
export async function executeCampaignDispatch(campaignId) {
  const campaign = await repo.findCampaignById(campaignId);
  if (!campaign) return null;

  // Prevent sending an already finished or cancelled campaign
  if (campaign.status === 'sent' || campaign.status === 'cancelled') {
    return campaign;
  }

  await repo.updateCampaign(campaignId, (doc) => {
    doc.status = 'sending';
    if (!doc.startedAt) doc.startedAt = new Date();
  });

  const audience = await findAudienceForCampaign({
    segment: campaign.segment,
    channel: campaign.channel,
  });

  const provider = getNotificationProviders()[campaign.channel];
  const targeted = audience.length;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const deliveryLogs = [];

  for (const member of audience) {
    const recipient = campaign.channel === 'email' ? member.email : member.phone;
    if (!recipient) {
      skippedCount++;
      deliveryLogs.push({
        campaignId: campaign._id,
        customerId: member._id,
        channel: campaign.channel,
        recipient: 'unknown',
        lang: member.lang || SOURCE_LANGUAGE,
        status: 'skipped',
        error: 'missing recipient address',
      });
      continue;
    }

    if (!provider?.enabled) {
      failedCount++;
      deliveryLogs.push({
        campaignId: campaign._id,
        customerId: member._id,
        channel: campaign.channel,
        recipient,
        lang: member.lang || SOURCE_LANGUAGE,
        status: 'failed',
        error: 'provider disabled',
      });
      continue;
    }

    const memberLang = member.lang || SOURCE_LANGUAGE;
    const unsubToken = createUnsubscribeToken({
      customerId: String(member._id),
      channel: campaign.channel,
    });
    const unsubUrl = `${config.API_PUBLIC_URL}/api/v1/campaigns/unsubscribe?token=${unsubToken}`;

    const vars = {
      customer: {
        name: member.name || '',
        email: member.email || '',
        phone: member.phone || '',
      },
      store: { name: 'SuperShop' },
      unsubscribe_url: unsubUrl,
    };

    const renderedSubject = interpolateCampaignTemplate(
      resolveLocalized(campaign.subject, memberLang),
      vars,
    );
    const renderedBody = interpolateCampaignTemplate(
      resolveLocalized(campaign.message, memberLang),
      vars,
    );

    try {
      const res = await provider.send({
        to: recipient,
        subject: renderedSubject,
        text: renderedBody,
      });
      sentCount++;
      deliveryLogs.push({
        campaignId: campaign._id,
        customerId: member._id,
        channel: campaign.channel,
        recipient,
        lang: memberLang,
        status: 'sent',
        provider: provider.name ?? null,
        providerRef: res?.id ?? null,
        sentAt: new Date(),
      });
    } catch (err) {
      failedCount++;
      deliveryLogs.push({
        campaignId: campaign._id,
        customerId: member._id,
        channel: campaign.channel,
        recipient,
        lang: memberLang,
        status: 'failed',
        provider: provider?.name ?? null,
        error: err.message,
      });
      logger.warn(
        { err: { message: err.message }, campaignId, recipient },
        'campaign message delivery failed',
      );
    }
  }

  // Insert delivery records in batch
  if (deliveryLogs.length > 0) {
    await repo.insertDeliveryLogs(deliveryLogs);
  }

  const finalStatus = failedCount === targeted && targeted > 0 ? 'failed' : 'sent';

  const completed = await repo.updateCampaign(campaignId, (doc) => {
    doc.status = finalStatus;
    doc.completedAt = new Date();
    doc.stats = {
      targeted,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
    };
  });

  void eventBus.emit(EVENTS.CAMPAIGN_SENT, {
    campaignId: String(completed._id),
    channel: completed.channel,
    stats: completed.stats,
  });

  return completed;
}

/**
 * Opts out a customer from future marketing campaigns.
 */
export async function optOutCustomer({ token, email, phone, channel = 'all' }) {
  let customerId = null;
  let targetChannel = channel;

  if (token) {
    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      throw new ValidationError('Invalid or expired unsubscribe token');
    }
    customerId = verified.customerId;
    if (verified.channel && verified.channel !== 'all') {
      targetChannel = verified.channel;
    }
  }

  const updated = await setCustomerMarketingOptOut({
    customerId,
    email,
    phone,
    channel: targetChannel,
    optOut: true,
  });

  void eventBus.emit(EVENTS.CAMPAIGN_OPT_OUT, {
    customerId: updated ? String(updated._id) : customerId,
    email: updated?.email ?? email,
    phone: updated?.phone ?? phone,
    channel: targetChannel,
  });

  return { success: true };
}

/**
 * Lists message delivery logs for a campaign.
 */
export async function listCampaignDeliveries(campaignId, { page = 1, limit = 50 } = {}) {
  const { items, total } = await repo.listDeliveries(campaignId, {
    skip: (page - 1) * limit,
    limit,
  });
  return {
    data: items.map((l) => ({
      id: String(l._id),
      campaignId: String(l.campaignId),
      customerId: String(l.customerId),
      channel: l.channel,
      recipient: l.recipient,
      lang: l.lang,
      status: l.status,
      provider: l.provider,
      providerRef: l.providerRef,
      error: l.error,
      sentAt: l.sentAt ? l.sentAt.toISOString() : null,
      createdAt: l.createdAt ? l.createdAt.toISOString() : null,
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
