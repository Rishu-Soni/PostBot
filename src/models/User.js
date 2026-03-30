'use strict';

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true },
    firstName: { type: String, default: '' },

    // Post preferences
    preferredStyles: { type: [String], default: ['Conversational', 'Storytelling', 'Punchy & Direct'] },
    preferredLayout: { type: String, default: 'Short Para' },
    preferredTone: { type: String, default: 'Casual' },

    // Onboarding state
    onboardingComplete: { type: Boolean, default: false },
    // true  → user has never completed onboarding (brand new account)
    // false → returning user who has already configured preferences at least once
    isNewUser: { type: Boolean, default: true },

    // Transient generation session
    inputState: { type: String, default: 'idle' },
    pendingVoiceFileId: { type: String, default: null },
    // Stores the user's media choice ('media' | 'nomedia') for the current generation session.
    // Set once when the user answers the media prompt; reused for all carousel renders
    // (including after modifications) so the correct button variant is always shown.
    pendingMediaChoice: { type: String, enum: ['media', 'nomedia'], default: 'nomedia' },
    pendingMediaIds: { type: [String], default: [] },
    currentPosts: { type: [String], default: [] },
    selectedPostIndex: { type: Number, default: null },
    mediaDoneMessageId: { type: Number, default: null },
    pendingRefinementHint: { type: String, default: null },

    // LinkedIn OAuth
    linkedinAccessToken: { type: String, default: null },
    linkedinTokenExpiry: { type: Date, default: null },
    linkedinRefreshToken: { type: String, default: null },

    // Privacy / audit
    delDataAt: { type: Date, default: null },
    countDelData: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
