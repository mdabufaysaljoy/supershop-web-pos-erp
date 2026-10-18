import { Subscriber } from './subscriber.model.js';

export async function findSubscriberByEmail(email) {
  return Subscriber.findOne({ email });
}

export async function findSubscriberById(id) {
  return Subscriber.findById(id);
}

export async function createSubscriber(data) {
  return Subscriber.create(data);
}

export async function listSubscribersRepo({ filter = {}, skip = 0, limit = 25 } = {}) {
  return Subscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
}

export async function countSubscribersRepo(filter = {}) {
  return Subscriber.countDocuments(filter);
}

export async function deleteSubscriberById(id) {
  return Subscriber.findByIdAndDelete(id);
}
