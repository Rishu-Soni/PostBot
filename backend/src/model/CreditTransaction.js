const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * creditTransactions
 * Append-only ledger. Every credit spend or purchase gets a row here —
 * never mutate userr.creditBalance without writing one of these first.
 * This is what lets you audit/reconcile the balance if something looks off.
 */
const creditTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', default: null }, // null for purchases/refunds not tied to a post

    reason: {
      type: String,
      enum: ['generation', 'regeneration', 'purchase', 'refund'],
      required: true,
    },

    // Negative for spend (generation/regeneration), positive for purchase/refund
    amount: { type: Number, required: true },

    balanceAfter: { type: Number, required: true }, // snapshot of user's balance post-transaction, for auditability

    note: { type: String, default: null }, // e.g. "regenerated image only" for partial regens
  },
  { timestamps: true } // createdAt acts as the transaction timestamp
);

creditTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
