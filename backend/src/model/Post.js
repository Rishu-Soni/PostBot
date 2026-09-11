const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * posts
 * One document per generated post, belonging to a contentBatch.
 * Tracks caption, hashtags, image provenance, edit history, credit-costed
 * regenerations, scheduling, and posting outcome.
 */
const postSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'ContentBatch', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // denormalized for fast lookups

    dayIndex: { type: Number, required: true, min: 1 }, // 1..N within the batch

    caption: { type: String, required: true },
    hashtags: {
      type: [String],
      validate: (arr) => arr.length <= 5,
      default: [],
    },

    // --- Image pipeline (spec step 5) ---
    image: {
      url: { type: String, default: null },
      source: {
        type: String,
        enum: ['user_upload', 'stock', 'ai_generated'],
        required: true,
      },
      stockProvider: { type: String, default: null }, // "unsplash" | "pexels" | "pixabay", if source === "stock"
      aiProvider: { type: String, default: null }, // "user_key" | "platform_default", if source === "ai_generated"
      altText: { type: String, default: null },
    },

    // --- Editing (manual edits are free + unlimited; regenerations cost credits — spec step 6) ---
    editHistory: [
      {
        editedAt: { type: Date, default: Date.now },
        field: { type: String, enum: ['caption', 'hashtags', 'image'] },
        type: { type: String, enum: ['manual_edit', 'regeneration'], required: true },
        // manual_edit -> free, unlimited. regeneration -> costs 1 credit, logged in creditTransactions.
      },
    ],
    regenerationCount: { type: Number, default: 0 }, // quick counter, avoids scanning editHistory

    // --- Scheduling & posting ---
    scheduledTime: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'posted', 'failed'],
      default: 'pending',
      index: true,
    },
    linkedinPostId: { type: String, default: null }, // set once successfully posted
    postedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

postSchema.index({ batchId: 1, dayIndex: 1 }, { unique: true });
postSchema.index({ status: 1, scheduledTime: 1 }); // scheduler's "find due posts" query

module.exports = mongoose.model('Post', postSchema);
