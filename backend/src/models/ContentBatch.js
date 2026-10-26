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
      theme: { type: String, default: 'Weekly Founder Insights' },
      professionalLevel: { type: String, default: null }, // e.g. "casual", "executive"
      tone: { type: String, default: null }, // "feel"
      writingStyle: { type: String, default: null },
      brainDump: { type: String, required: true }, // raw free-text input
      weeklyGoal: { type: String, default: null },
      voiceDNA: { type: Schema.Types.Mixed, default: null },
    },

    // --- Per-Post Strategy Cards & Overview ---
    extractedTheme: { type: String, default: null },
    strategyOverview: { type: String, default: null },
    postsStrategy: [
      {
        dayIndex: { type: Number, required: true },
        subtopic: { type: String, default: '' },
        angle: { type: String, default: '' },
        hookPreview: { type: String, default: '' },
        matchedTemplateId: { type: String, default: 'metric-teardown' },
        matchedTemplateName: { type: String, default: 'The Metric Teardown' },
        tone: { type: String, default: 'Direct & Contrarian' },
        coreInsight: { type: String, default: '' },
        ctaDirection: { type: String, default: '' },
      },
    ],

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
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry for drafts
      index: true,
    },
    expiryWarningSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

contentBatchSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('ContentBatch', contentBatchSchema);
