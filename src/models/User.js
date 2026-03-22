'use strict';

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    telegramId:           { type: String, required: true, unique: true },
    firstName:            { type: String, default: '' },
    preferredStyles:      { type: [String], default: ['Punchy & Direct', 'Storytelling', 'Analytical'] },
    preferredLayout:      { type: String, default: 'Single block' },
    preferredTone:        { type: String, default: 'Professional' },
    onboardingComplete:   { type: Boolean, default: false },
    linkedinAccessToken:  { type: String, default: null },
    linkedinTokenExpiry:  { type: Date, default: null },
    linkedinRefreshToken: { type: String, default: null },
    delDataAt:            { type: Date, default: null },
    countDelData:         { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
