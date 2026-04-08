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

    // Transient session — only populated during media upload
    inputState: { type: String, default: 'idle' },
    pendingPostText: { type: String, default: null },   // text of the post the user selected for media upload
    pendingMediaIds: { type: [String], default: [] },
    mediaDoneMessageId: { type: Number, default: null },

    // Rate limiter
    lastGenerationAt: { type: Date, default: null },

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