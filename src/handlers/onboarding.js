// src/handlers/onboarding.js
// ─────────────────────────────────────────────────────────────────────────────
// Multi-step onboarding handler for new Postbot users.
//
// FIX TRACKER
//   FIX 6: editMessageText() calls now have try/catch around them.
//           Telegram rejects edits with "message is not modified" (400) if the
//           content hasn't changed (e.g. user re-taps the same button). Without
//           this guard the error bubbles up, logs an ugly stack trace, and could
//           leave the user without any feedback.
//   FIX 7: handleTonePick now guards against a null/undefined chosenStyle or
//           chosenLayout in session.temp. If the session expired between steps
//           (30-min TTL), the handler would silently write undefined to MongoDB
//           and produce a broken state. We now detect this and restart onboarding.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { Markup } = require('telegraf');
const User  = require('../models/User');
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

// ── Static choice lists ───────────────────────────────────────────────────────

const STYLE_OPTIONS = [
  { label: '⚡ Punchy & Direct',  value: 'Punchy & Direct' },
  { label: '📖 Storytelling',     value: 'Storytelling'    },
  { label: '🔬 Analytical',       value: 'Analytical'      },
  { label: '😄 Conversational',   value: 'Conversational'  },
];

const LAYOUT_OPTIONS = [
  { label: '📄 Single block',     value: 'Single block'     },
  { label: '🔢 Numbered list',    value: 'Numbered list'    },
  { label: '• Bullet points',     value: 'Bullet points'    },
  { label: '📝 Short paragraphs', value: 'Short paragraphs' },
];

const TONE_OPTIONS = [
  { label: '💼 Professional', value: 'Professional' },
  { label: '😊 Casual',       value: 'Casual'       },
  { label: '🔥 Motivational', value: 'Motivational' },
  { label: '😂 Humorous',     value: 'Humorous'     },
];

// Maps the primary style choice to a 3-element styles array.
const STYLE_MAP = {
  'Punchy & Direct': ['Punchy & Direct', 'Storytelling',  'Analytical'      ],
  'Storytelling':    ['Storytelling',    'Punchy & Direct','Analytical'      ],
  'Analytical':      ['Analytical',      'Storytelling',   'Punchy & Direct' ],
  'Conversational':  ['Conversational',  'Storytelling',   'Punchy & Direct' ],
};

// ── Keyboard builder ──────────────────────────────────────────────────────────

/** 2-column inline keyboard for a list of option objects. */
function buildChoiceKeyboard(options, prefix) {
  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(
      options.slice(i, i + 2).map((o) =>
        Markup.button.callback(o.label, `${prefix}:${o.value}`)
      )
    );
  }
  return Markup.inlineKeyboard(rows);
}

// ── Shared helper: edit message with error handling ───────────────────────────

/**
 * Attempt to edit a message. Silently ignores "message is not modified" errors
 * (HTTP 400 with "message is not modified" text) so double-taps don't crash.
 *
 * FIX 6: Without this, re-tapping an already-processed button throws an
 * unhandled error because Telegram's "message is not modified" error has no
 * special error code — it's a generic BadRequest with that string in the message.
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} text
 * @param {object} [extra]
 */
async function safeEditMessageText(ctx, text, extra) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    // Telegram error: 400 Bad Request: message is not modified
    // This happens when the user taps the same button twice.
    if (err.message && err.message.includes('message is not modified')) {
      return; // silently ignore — idempotent operation
    }
    throw err; // re-throw genuinely unexpected errors
  }
}

// ── Handler: /start command ───────────────────────────────────────────────────

/**
 * Called from server.js bot.start(). Branches on new vs. returning user.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleStart(ctx) {
  const telegramId = String(ctx.from.id);
  const firstName  = ctx.from.first_name || 'there';

  try {
    // Upsert: rawResult lets us distinguish insert vs. find via lastErrorObject.
    const rawResult = await User.findOneAndUpdate(
      { telegramId },
      { $setOnInsert: { telegramId, firstName } },
      { upsert: true, new: false, rawResult: true }
    );

    const isNewUser = !!rawResult?.lastErrorObject?.upserted;

    // Reset session (clean slate) whenever /start is sent.
    updateSession(telegramId, { step: STEPS.IDLE, posts: [], temp: {} });

    if (isNewUser) {
      updateSession(telegramId, { step: STEPS.ONBOARDING_STYLE });
      await ctx.reply(
        `👋 Welcome to *Postbot*, ${firstName}!\n\n` +
        `I turn your voice note brain-dumps into 3 polished LinkedIn posts in seconds.\n\n` +
        `Let's set up your content style. You can always change these later with /settings.\n\n` +
        `*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?`,
        { parse_mode: 'Markdown', ...buildChoiceKeyboard(STYLE_OPTIONS, 'ob_style') }
      );
    } else {
      // Returning user — check if onboarding was completed.
      const user = await User.findOne({ telegramId });

      if (!user?.onboardingComplete) {
        // Incomplete onboarding (e.g. disconnected mid-flow).
        updateSession(telegramId, { step: STEPS.ONBOARDING_STYLE });
        await ctx.reply(
          `👋 Welcome back, ${firstName}! Looks like we didn't finish setting up last time.\n\n` +
          `*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?`,
          { parse_mode: 'Markdown', ...buildChoiceKeyboard(STYLE_OPTIONS, 'ob_style') }
        );
        return;
      }

      updateSession(telegramId, { step: STEPS.WAITING_VOICE });
      await ctx.reply(
        `Welcome back, *${firstName}*! 🎉\n\n` +
        `Your saved preferences:\n` +
        `• Style: ${(user.preferredStyles || []).join(', ')}\n` +
        `• Layout: ${user.preferredLayout}\n` +
        `• Tone: ${user.preferredTone}\n\n` +
        `🎙 Send me a *voice note* whenever you're ready!`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('[onboarding] handleStart error:', err);
    await ctx.reply('😔 Something went wrong. Please try /start again.');
  }
}

// ── Onboarding step 1: Writing Style ─────────────────────────────────────────

/**
 * Handles "ob_style:<value>" callback. Advances to layout step.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleStylePick(ctx) {
  await ctx.answerCbQuery();

  const telegramId = String(ctx.from.id);
  const value      = ctx.match[1];

  updateSession(telegramId, {
    step: STEPS.ONBOARDING_LAYOUT,
    temp: { ...getSession(telegramId).temp, chosenStyle: value },
  });

  // FIX 6: Use safeEditMessageText to silently handle double-taps.
  await safeEditMessageText(
    ctx,
    `✅ *Writing style:* ${value}\n\n` +
    `*Step 2 of 3 — Post Layout*\nHow should your posts be formatted?`,
    { parse_mode: 'Markdown', ...buildChoiceKeyboard(LAYOUT_OPTIONS, 'ob_layout') }
  );
}

// ── Onboarding step 2: Layout ─────────────────────────────────────────────────

/**
 * Handles "ob_layout:<value>" callback. Advances to tone step.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleLayoutPick(ctx) {
  await ctx.answerCbQuery();

  const telegramId = String(ctx.from.id);
  const value      = ctx.match[1];

  updateSession(telegramId, {
    step: STEPS.ONBOARDING_TONE,
    temp: { ...getSession(telegramId).temp, chosenLayout: value },
  });

  await safeEditMessageText(
    ctx,
    `✅ *Layout:* ${value}\n\n` +
    `*Step 3 of 3 — Tone*\nWhat tone should your posts have?`,
    { parse_mode: 'Markdown', ...buildChoiceKeyboard(TONE_OPTIONS, 'ob_tone') }
  );
}

// ── Onboarding step 3: Tone (final step) ──────────────────────────────────────

/**
 * Handles "ob_tone:<value>" callback. Persists all preferences to MongoDB.
 *
 * FIX 7: Guards against missing chosenStyle / chosenLayout in session.temp.
 *        If the session expired between step 1 and step 3 (30+ min gap), these
 *        would be undefined, writing `undefined` strings to MongoDB silently.
 *        We now detect this and restart onboarding instead.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleTonePick(ctx) {
  await ctx.answerCbQuery();

  const telegramId = String(ctx.from.id);
  const value      = ctx.match[1];
  const session    = getSession(telegramId);
  const { chosenStyle, chosenLayout } = session.temp ?? {};

  // FIX 7: Detect session-expired mid-onboarding.
  if (!chosenStyle || !chosenLayout) {
    console.warn(
      `[onboarding] handleTonePick: missing temp data for ${telegramId}. ` +
      `chosenStyle=${chosenStyle}, chosenLayout=${chosenLayout}. Restarting onboarding.`
    );
    updateSession(telegramId, { step: STEPS.ONBOARDING_STYLE, temp: {} });
    // Answer the stale callback first, then restart from step 1.
    await ctx.reply(
      '⚠️ Your setup session expired. Let\'s start over!\n\n' +
      '*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?',
      { parse_mode: 'Markdown', ...buildChoiceKeyboard(STYLE_OPTIONS, 'ob_style') }
    );
    return;
  }

  const styles = STYLE_MAP[chosenStyle] ?? ['Punchy & Direct', 'Storytelling', 'Analytical'];

  try {
    await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          preferredStyles:    styles,
          preferredLayout:    chosenLayout,
          preferredTone:      value,
          onboardingComplete: true,
        },
      }
    );

    updateSession(telegramId, { step: STEPS.WAITING_VOICE, temp: {} });

    await safeEditMessageText(
      ctx,
      `✅ *Tone:* ${value}\n\n` +
      `🎉 *All set, ${ctx.from.first_name || 'there'}!*\n\n` +
      `Your preferences:\n` +
      `• Style: ${styles.join(', ')}\n` +
      `• Layout: ${chosenLayout}\n` +
      `• Tone: ${value}\n\n` +
      `🎙 *Now send me a voice note* with your raw thoughts or ideas.\n\n` +
      `_Use /settings any time to review your preferences._`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[onboarding] handleTonePick error:', err);
    await ctx.reply('😔 Could not save your preferences. Please try /start again.');
  }
}

module.exports = { handleStart, handleStylePick, handleLayoutPick, handleTonePick };
