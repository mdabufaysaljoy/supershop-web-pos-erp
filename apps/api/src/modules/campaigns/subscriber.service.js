import { EVENTS } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { NotFoundError, ValidationError } from '../../core/errors.js';
import { setCustomerMarketingOptOut } from '../customers/index.js';
import * as repo from './subscriber.repo.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toSubscriberDto(doc) {
  return {
    id: String(doc._id),
    email: doc.email,
    status: doc.status,
    source: doc.source || 'storefront_newsletter',
    ip: doc.ip ?? null,
    userAgent: doc.userAgent ?? null,
    subscribedAt: doc.subscribedAt ? doc.subscribedAt.toISOString() : null,
    unsubscribedAt: doc.unsubscribedAt ? doc.unsubscribedAt.toISOString() : null,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}

/**
 * Subscribes an email to the newsletter / offer updates list.
 * Idempotent: repeated subscriptions update status if previously unsubscribed, or return existing.
 */
export async function subscribeNewsletter({
  email,
  source = 'storefront_newsletter',
  ip = null,
  userAgent = null,
} = {}) {
  const cleanEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
    throw new ValidationError(
      [{ path: 'email', message: 'Invalid email address' }],
      'A valid email address is required',
    );
  }

  const existing = await repo.findSubscriberByEmail(cleanEmail);
  if (existing) {
    let reactivated = false;
    if (existing.status === 'unsubscribed') {
      existing.status = 'subscribed';
      existing.unsubscribedAt = null;
      existing.subscribedAt = new Date();
      if (source) existing.source = source;
      if (ip) existing.ip = ip;
      if (userAgent) existing.userAgent = userAgent;
      await existing.save();
      reactivated = true;
    }

    try {
      await setCustomerMarketingOptOut({ email: cleanEmail, channel: 'email', optOut: false });
    } catch {
      // safe fallback if not a registered customer
    }

    return {
      subscriber: toSubscriberDto(existing),
      isNew: false,
      reactivated,
      alreadySubscribed: !reactivated,
    };
  }

  const created = await repo.createSubscriber({
    email: cleanEmail,
    status: 'subscribed',
    source,
    ip,
    userAgent,
    subscribedAt: new Date(),
  });

  try {
    await setCustomerMarketingOptOut({ email: cleanEmail, channel: 'email', optOut: false });
  } catch {
    // safe fallback if not a registered customer
  }

  void eventBus.emit(EVENTS.CAMPAIGN_OPT_IN, {
    email: cleanEmail,
    source,
  });

  return {
    subscriber: toSubscriberDto(created),
    isNew: true,
    reactivated: false,
    alreadySubscribed: false,
  };
}

/**
 * Lists newsletter subscribers with filtering, search and pagination for admin panel.
 */
export async function listSubscribers({ q, status, page = 1, limit = 25 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 25));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  if (status && (status === 'subscribed' || status === 'unsubscribed')) {
    filter.status = status;
  }
  if (q && String(q).trim()) {
    const escaped = String(q)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.email = { $regex: escaped, $options: 'i' };
  }

  const [items, total, activeCount, unsubscribedCount] = await Promise.all([
    repo.listSubscribersRepo({ filter, skip, limit: limitNum }),
    repo.countSubscribersRepo(filter),
    repo.countSubscribersRepo({ status: 'subscribed' }),
    repo.countSubscribersRepo({ status: 'unsubscribed' }),
  ]);

  return {
    data: items.map(toSubscriberDto),
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      activeCount,
      unsubscribedCount,
    },
  };
}

/**
 * Updates a subscriber's status (e.g. toggle between subscribed and unsubscribed).
 */
export async function updateSubscriber(id, { status } = {}) {
  if (status !== 'subscribed' && status !== 'unsubscribed') {
    throw new ValidationError([
      { path: 'status', message: 'Status must be subscribed or unsubscribed' },
    ]);
  }

  const subscriber = await repo.findSubscriberById(id);
  if (!subscriber) throw new NotFoundError('Subscriber not found');

  subscriber.status = status;
  if (status === 'unsubscribed') {
    subscriber.unsubscribedAt = new Date();
  } else {
    subscriber.unsubscribedAt = null;
    subscriber.subscribedAt = new Date();
  }

  await subscriber.save();

  try {
    await setCustomerMarketingOptOut({
      email: subscriber.email,
      channel: 'email',
      optOut: status === 'unsubscribed',
    });
  } catch {
    // safe fallback
  }

  return toSubscriberDto(subscriber);
}

/**
 * Deletes a subscriber record by ID.
 */
export async function deleteSubscriber(id) {
  const result = await repo.deleteSubscriberById(id);
  if (!result) throw new NotFoundError('Subscriber not found');
  return { success: true };
}
