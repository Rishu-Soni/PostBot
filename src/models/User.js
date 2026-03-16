// src/models/User.js
// ─────────────────────────────────────────────────────────────────────────────
// Mongoose schema for a Postbot user.
// Each document represents one unique Telegram user identified by their
// numeric Telegram ID, which never changes even if they rename themselves.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    // The unique, immutable numeric ID Telegram assigns every user account.
    // Stored as String to avoid 64-bit integer precision loss in JS.
    // unique:true already creates a MongoDB index — index:true would be redundant.
    telegramId: {
      type:     String,
      required: true,
      unique:   true,
    },

    // The first name Telegram reports — used for personalised greetings only.
    firstName: {
      type:    String,
      default: '',
    },

    // ── Content Preferences (collected during onboarding) ─────────────────────
    // The three writing styles used in the Gemini system prompt.
    // Users choose these during onboarding and can change them via /settings.
    preferredStyles: {
      type:    [String],
      default: ['Punchy & Direct', 'Storytelling', 'Analytical'],
    },

    // How the post text should be formatted/laid out.
    // Options presented during onboarding: 'Single block', 'Numbered list', 'Bullet points'
    preferredLayout: {
      type:    String,
      default: 'Single block',
    },

    // The overall tone/voice of the posts.
    // Options: 'Professional', 'Casual', 'Motivational', 'Humorous'
    preferredTone: {
      type:    String,
      default: 'Professional',
    },

    // Tracks whether the user has completed onboarding.
    // False until they finish all 3 preference steps.
    onboardingComplete: {
      type:    Boolean,
      default: false,
    },

    // ── LinkedIn OAuth ────────────────────────────────────────────────────────
    // OAuth 2.0 access token for posting to LinkedIn on the user's behalf.
    // null = user has not connected their LinkedIn account yet.
    linkedinAccessToken: {
      type:    String,
      default: null,
    },

    // Expiry timestamp for the access token. Access tokens are typically valid
    // for 60 days. We pro-actively refresh within 7 days of expiry.
    linkedinTokenExpiry: {
      type:    Date,
      default: null,
    },

    // Refresh token, if LinkedIn provides one (only available for select app types).
    // May be null for standard developer apps.
    linkedinRefreshToken: {
      type:    String,
      default: null,
    },
  },
  {
    // Automatically manages createdAt and updatedAt timestamps.
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
