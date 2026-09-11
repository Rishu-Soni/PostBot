const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * notifications
 * Log of every alert sent to a user — scheduled-post failures (spec step 9)
 * and low-stock reminders (spec step 8, "batch exhausted"). Doubles as a
 * delivery record so you can debug "I never got the email" complaints.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', default: null }, // set for posting_failure, null for low_stock
    batchId: { type: Schema.Types.ObjectId, ref: 'ContentBatch', default: null },

    type: {
      type: String,
      enum: ['posting_failure', 'token_expired', 'low_stock'],
      required: true,
    },

    channels: {
      type: [String],
      enum: ['email', 'sms'],
      default: [],
    },

    message: { type: String, required: true },

    deliveryStatus: {
      type: String,
      enum: ['sent', 'failed', 'pending'],
      default: 'pending',
    },

    resolved: { type: Boolean, default: false }, // e.g. user reconnected LinkedIn after a token_expired alert
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
