import mongoose from 'mongoose';
import { TRACKING_LOG_STATUS, TRACKING_PROVIDERS } from '@supershop/shared';

const { Schema } = mongoose;

const trackingEventLogSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: TRACKING_PROVIDERS,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: TRACKING_LOG_STATUS,
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    response: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    errorMessage: {
      type: String,
      default: null,
    },
    isTest: {
      type: Boolean,
      default: false,
      index: true,
    },
    testEventCode: {
      type: String,
      default: null,
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    skipReason: {
      type: String,
      default: null,
    },
  },
  { collection: 'tracking_event_logs', timestamps: true, minimize: false },
);

// Compound indexes for admin log viewer query performance
trackingEventLogSchema.index({ provider: 1, createdAt: -1 });
trackingEventLogSchema.index({ status: 1, createdAt: -1 });
trackingEventLogSchema.index({ event: 1, createdAt: -1 });

// TTL index: automatically expire logs older than 30 days
trackingEventLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const TrackingEventLog =
  mongoose.models.TrackingEventLog ?? mongoose.model('TrackingEventLog', trackingEventLogSchema);
