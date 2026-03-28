'use strict';

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true },
    firstName: { type: String, default: '' },
    preferredStyles: { type: [String], default: ['Conversational', 'Storytelling', 'Punchy & Direct'] },
    preferredLayout: { type: String, default: 'Short Para' },
    preferredTone: { type: String, default: 'Casual' },
    onboardingComplete: { type: Boolean, default: false },
    inputState: { type: String, default: 'idle' },
    pendingVoiceFileId: { type: String, default: null },
    pendingMediaIds: { type: [String], default: [] },
    currentPosts: { type: [String], default: [] },
    selectedPostIndex: { type: Number, default: null },
    mediaDoneMessageId: { type: Number, default: null },
    pendingRefinementHint: { type: String, default: null },
    linkedinAccessToken: { type: String, default: null },
    linkedinTokenExpiry: { type: Date, default: null },
    linkedinRefreshToken: { type: String, default: null },
    delDataAt: { type: Date, default: null },
    countDelData: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
