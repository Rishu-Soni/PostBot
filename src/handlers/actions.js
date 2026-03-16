// src/handlers/actions.js
// ─────────────────────────────────────────────────────────────────────────────
// Inline keyboard action handlers for Postbot.
//
// FIX TRACKER
//   FIX 4: Null-user guard — if User.findOne() returns null (user document was
//           deleted from DB after session was created), the code no longer
//           crashes with "Cannot read properties of null". Instead we treat it
//           as NOT_CONNECTED and prompt /connect or /start.
//   FIX 5: answerCbQuery now shows a neutral spinner message ("Working on it…")
//           rather than "Posting to LinkedIn…" since the post might fail; the
//           success/failure reply is the definitive feedback.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken } = require('../services/linkedin');
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

// ── Post selection handlers ───────────────────────────────────────────────────

/**
 * Handles post_0 / post_1 / post_2 button taps.
 * ctx.match[1] is the digit captured from /^post_(\d)$/.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handlePostAction(ctx) {
  const telegramId  = String(ctx.from.id);
  const optionIndex = parseInt(ctx.match[1], 10);
  const session     = getSession(telegramId);

  // ── Validate session still has posts ─────────────────────────────────────
  if (!session.posts || session.posts.length < 3) {
    await ctx.answerCbQuery('⚠️ Session expired — send a new voice note.', { show_alert: true });
    return;
  }

  const selectedPost = session.posts[optionIndex];
  if (!selectedPost) {
    await ctx.answerCbQuery('⚠️ Could not find that post. Please try again.', { show_alert: true });
    return;
  }

  // FIX 5: Neutral spinner — we don't know yet if it'll succeed
  await ctx.answerCbQuery('⏳ Working on it…');

  try {
    // ── FIX 4: Guard against null user document ───────────────────────────
    // User.findOne() returns null if the document was deleted from MongoDB
    // after the session was created. getValidAccessToken(null) would crash
    // with "Cannot read properties of null".
    const user = await User.findOne({ telegramId });
    if (!user) {
      await ctx.reply(
        '⚠️ Your account was not found. Please send /start to re-register.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let accessToken;
    try {
      accessToken = await getValidAccessToken(user);
    } catch (tokenErr) {
      if (tokenErr.message === 'NOT_CONNECTED') {
        await ctx.reply(
          '🔗 *LinkedIn not connected yet!*\n\n' +
          'Send /connect to link your LinkedIn account, then tap the button again.',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      if (tokenErr.message === 'TOKEN_EXPIRED') {
        await ctx.reply(
          '🔒 Your LinkedIn session has expired.\n\n' +
          'Send /connect to re-authorise and try again.',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      throw tokenErr;
    }

    // ── Post to LinkedIn ──────────────────────────────────────────────────
    const { postUrl } = await postToLinkedIn(accessToken, selectedPost);

    // Reset session so the user can immediately send another voice note.
    updateSession(telegramId, { step: STEPS.WAITING_VOICE, posts: [], temp: {} });

    await ctx.reply(
      `🎉 *Your post is live on LinkedIn!*\n\n` +
      `[View your post →](${postUrl})\n\n` +
      `_Ready for your next idea? Send another voice note!_`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('[actions] handlePostAction error:', err.message);
    // Surface a clean error message — avoid leaking internal error details
    const isKnownError = err.message.startsWith('[LinkedIn]');
    await ctx.reply(
      '😔 Failed to post to LinkedIn.\n\n' +
      (isKnownError ? err.message : 'An unexpected error occurred.') +
      '\n\nPlease try again, or send /connect to re-link your account.',
      { parse_mode: 'Markdown' }
    );
  }
}

// ── Revise flow handlers ──────────────────────────────────────────────────────

/**
 * Handles the "🔄 Revise a Post" button.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleReviseAction(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const session    = getSession(telegramId);

  if (!session.posts || session.posts.length < 3) {
    await ctx.reply('⚠️ Session expired. Please send a new voice note first.');
    return;
  }

  updateSession(telegramId, { step: STEPS.WAITING_REVISE_PICK });

  await ctx.reply(
    '🔄 *Revise a Post*\n\nWhich option would you like to refine?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('Option 1', 'revise_pick_0'),
          Markup.button.callback('Option 2', 'revise_pick_1'),
          Markup.button.callback('Option 3', 'revise_pick_2'),
        ],
      ]),
    }
  );
}

/**
 * Handles revise_pick_0 / revise_pick_1 / revise_pick_2 button taps.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleRevisePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId  = String(ctx.from.id);
  const targetIndex = parseInt(ctx.match[1], 10);
  const session     = getSession(telegramId);

  if (!session.posts || session.posts.length < 3) {
    await ctx.reply('⚠️ Session expired. Please send a new voice note first.');
    return;
  }

  updateSession(telegramId, {
    step: STEPS.WAITING_REVISE_INPUT,
    temp: { ...session.temp, reviseTargetIndex: targetIndex },
  });

  await ctx.reply(
    `✏️ *Revising Option ${targetIndex + 1}*\n\n` +
    `Tell me how you'd like it changed — send a *voice note* or type your instructions below.\n\n` +
    `_Examples: "Make it shorter and punchier" or "Add a statistic about remote work"_`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { handlePostAction, handleReviseAction, handleRevisePick };
