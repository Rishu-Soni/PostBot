const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * users
 * One document per account. Holds auth, LinkedIn OAuth state, credit
 * balance, notification prefs, and optional bring-your-own API key for
 * image generation.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false }, // omit from default queries

    // --- LinkedIn OAuth (personal profile scope: w_member_social) ---
    linkedin: {
      linkedinUserId: { type: String, default: null }, // "sub" from LinkedIn profile
      accessToken: { type: String, default: null, select: false },
      refreshToken: { type: String, default: null, select: false },
      tokenExpiresAt: { type: Date, default: null }, // access tokens expire in 60 days — scheduler must check this
      scope: { type: String, default: null },
      connectedAt: { type: Date, default: null },
      isConnected: { type: Boolean, default: false },
    },

    // --- Credits ---
    creditBalance: { type: Number, required: true, default: 0, min: 0 },

    // --- Optional bring-your-own image-gen key (encrypt at rest in real deployment) ---
    imageGenApiKey: { type: String, default: null, select: false },
    imageGenProvider: { type: String, default: null }, // e.g. "openai", "stability"

    // --- Notification prefs (used for scheduled-post failure alerts, low-stock reminders) ---
    notificationPrefs: {
      email: { type: String, default: null },
      phone: { type: String, default: null }, // E.164 format for SMS
      emailEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
    },

    // --- Posting defaults ---
    defaultPostTime: { type: String, default: '09:00' }, // "HH:mm", interpreted in timezone below
    timezone: { type: String, default: 'UTC' }, // IANA tz, e.g. "Asia/Kolkata"
  },
  { timestamps: true } // createdAt, updatedAt
);

userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
