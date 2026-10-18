import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Newsletter subscriber record.
 * Stores visitors and customers who opted in to promotional updates, flash sale announcements, and discounts.
 */
const subscriberSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    status: {
      type: String,
      enum: ['subscribed', 'unsubscribed'],
      default: 'subscribed',
      index: true,
    },
    source: {
      type: String,
      default: 'storefront_newsletter',
      trim: true,
      maxlength: 60,
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
    },
    unsubscribedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'newsletter_subscribers',
    timestamps: true,
  },
);

subscriberSchema.index({ createdAt: -1 });

export const Subscriber = mongoose.model('Subscriber', subscriberSchema);
