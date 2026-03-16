// src/handlers/text.js
// ─────────────────────────────────────────────────────────────────────────────
// Text message handler — routes based on the user's current session state.
//
// FIX TRACKER
//   FIX 2: Eliminated duplicate Gemini client. Text revision now calls
//           gemini.revisePosts() instead of duplicating API boilerplate.
//   FIX 3: User revision instructions are sanitised before being embedded
//           in the Gemini system prompt to prevent prompt injection.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { Markup }  = require('telegraf');
const { revisePosts } = require('../services/gemini'); // FIX 2: use shared service
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

/**
 * Main text message handler. Routes based on session.step.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleText(ctx) {
  const telegramId = String(ctx.from.id);
  const session    = getSession(telegramId);
  const text       = ctx.message?.text?.trim() ?? '';

  // Ignore empty messages and Telegram /command messages that Telegraf mis-routes.
  // (In practice Telegraf's command() handler fires first, but being defensive
  // here prevents the catch-all from eating unrecognised slash commands.)
  if (!text || text.startsWith('/')) return;

  switch (session.step) {
    case STEPS.WAITING_REVISE_INPUT:
      await handleTextRevise(ctx, telegramId, text, session);
      break;

    case STEPS.WAITING_VOICE:
      await ctx.reply(
        '🎙 I\'m ready! Send me a *voice note* with your thoughts and I\'ll turn them into 3 LinkedIn posts.',
        { parse_mode: 'Markdown' }
      );
      break;

    case STEPS.IDLE:
      await ctx.reply('👋 Send /start to get going!');
      break;

    case STEPS.WAITING_REVISE_PICK:
      await ctx.reply(
        '⬆️ Please use the buttons above to choose which option to revise.'
      );
      break;

    default:
      // Onboarding states — guide user back to the buttons.
      await ctx.reply('👆 Please use the buttons above to complete setup.');
  }
}

/**
 * Handles text-based revision instructions.
 * Calls the shared gemini.revisePosts() service with sanitised instructions.
 *
 * @param {import('telegraf').Context} ctx
 * @param {string} telegramId
 * @param {string} instructions - User's typed revision text
 * @param {object} session
 */
async function handleTextRevise(ctx, telegramId, instructions, session) {
  const targetIndex = session.temp?.reviseTargetIndex ?? null;
  const posts       = session.posts;

  if (!posts || posts.length < 3) {
    await ctx.reply('⚠️ Session expired. Please send a new voice note first.');
    updateSession(telegramId, { step: STEPS.WAITING_VOICE, temp: {} });
    return;
  }

  // FIX 3: Sanitise user instructions before embedding in the Gemini prompt.
  // Truncate to 500 chars to prevent extremely large prompts.
  // Strip characters that could be used to break prompt structure.
  const sanitised = instructions
    .slice(0, 500)
    .replace(/[`\\"]/g, "'"); // replace backtick, backslash, double-quote with single quote

  const thinkingMsg = await ctx.reply('✍️ Revising with Gemini… give me a moment.');

  try {
    // FIX 2: Call the shared revisePosts() service instead of duplicating
    // the entire Gemini API boilerplate here.
    const newPosts = await revisePosts(posts, sanitised, targetIndex);

    updateSession(telegramId, {
      step:  STEPS.WAITING_VOICE,
      posts: newPosts,
      temp:  {},
    });

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply('✨ *Here are your 3 updated LinkedIn posts:*', { parse_mode: 'Markdown' });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Post Option 1', 'post_0'),
        Markup.button.callback('✅ Post Option 2', 'post_1'),
        Markup.button.callback('✅ Post Option 3', 'post_2'),
      ],
      [Markup.button.callback('🔄 Revise a Post', 'revise')],
    ]);

    for (let i = 0; i < newPosts.length; i++) {
      const postText = `────── Option ${i + 1} ──────\n\n${newPosts[i]}`;
      await ctx.reply(postText, i === newPosts.length - 1 ? keyboard : {});
    }
  } catch (err) {
    console.error('[text] handleTextRevise error:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      `😔 Revision failed.\n\n${err.message.startsWith('[Gemini]') ? err.message : 'Please try again or send a new voice note.'}`
    );
  }
}

module.exports = { handleText };
