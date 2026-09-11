const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * contentBatches
 * One document per weekly brain-dump. Stores the guided-prompt intake,
 * the AI-elaborated strategy (never shown to the user directly — spec
 * step 2 & 6), and the day-split the batch's posts were generated for.
 */
const contentBatchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // --- Guided prompt intake (spec step 1) ---
    intake: {
      theme: { type: String, required: true },
      professionalLevel: { type: String, default: null }, // e.g. "casual", "executive"
      tone: { type: String, default: null }, // "feel"
      writingStyle: { type: String, default: null },
      brainDump: { type: String, required: true }, // raw free-text input
    },

    // --- Hidden elaboration (spec step 2 — internal only, never sent to frontend) ---
    elaboratedStrategy: { type: String, required: true, select: false },

    // --- Day-split (spec step 3) ---
    recommendedDayCount: { type: Number, required: true, min: 1 },
    finalDayCount: { type: Number, required: true, min: 1 },
    // enforce the ±2 adjustment rule at the application layer, e.g.:
    // if (Math.abs(finalDayCount - recommendedDayCount) > 2) throw ...

    status: {
      type: String,
      enum: ['draft', 'confirmed', 'active', 'exhausted'],
      default: 'draft',
      index: true,
    },

    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contentBatchSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('ContentBatch', contentBatchSchema);
