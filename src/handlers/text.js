'use strict';

const User = require('../models/User');
const { revisePosts, extractPreferences } = require('../services/gemini');
const { sendPostMessages, MODIFY_MARKER } = require('./voice');

/**
 * Extracts the original post text from a ForceReply message.
 * The bot embeds it after MODIFY_MARKER when the user clicks "✏️ Modify this".
 */
function extractOriginalPost(replyText) {
  const idx = replyText.indexOf(MODIFY_MARKER);
  if (idx === -1) return null;
  return replyText.slice(idx + MODIFY_MARKER.length).trim();
}

async function handleText(ctx) {
  const text = ctx.message?.text?.trim() ?? '';
  if (!text || text.startsWith('/')) return;

  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  // ── Smart Onboarding: Example Analysis ─────────────────────────────────────
  if (user?.inputState === 'awaiting_example') {
    if (text.length < 80) {
      return ctx.reply(
        '⚠️ That post is too short to analyze accurately.\n\n' +
        'Please paste a *full LinkedIn post* (at least a few sentences) so I can learn your writing style.',
        { parse_mode: 'Markdown' }
      );
    }
    const thinkingMsg = await ctx.reply('🔍 Analyzing your post format, style, and tone...');
    try {
      // Pin the message so the bot can reference the layout in future generations
      await ctx.pinChatMessage(ctx.message.message_id, { disable_notification: true }).catch(() => {});

      const prefs = await extractPreferences(text);

      user.preferredTone    = prefs.preferredTone    || 'Professional';
      user.preferredStyles  = prefs.preferredStyles?.length ? prefs.preferredStyles : ['Punchy & Direct'];
      user.preferredLayout  = 'Short Para'; // Default label; actual layout driven by the pinned message dynamically
      user.inputState       = 'idle';
      user.onboardingComplete = true;
      await user.save();

      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
      await ctx.reply(
        `✅ *Analysis Complete!*\n\n` +
        `Here is what I learned about your writing style:\n` +
        `• *Tone:* ${user.preferredTone}\n` +
        `• *Style:* ${user.preferredStyles.join(', ')}\n\n` +
        `I have pinned your example post. I will strictly use its layout for future posts.\n` +
        `_(If the pinned message is removed, I will fall back to the Short Para default layout.)_\n\n` +
        `🎙 Send a *voice note* now to get started!`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[text] Error analyzing example:', err);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
      await ctx.reply(
        '😔 I had trouble analyzing that text. Please try again or use /setstyle for manual setup.'
      );
    }
    return;
  }

  // ── Text Revision via ForceReply ────────────────────────────────────────────
  // The user replied with text to a "✏️ Modify this" ForceReply prompt.
  // The original post text is embedded in the quoted message after MODIFY_MARKER.
  const originalPost = ctx.message.reply_to_message?.text
    ? extractOriginalPost(ctx.message.reply_to_message.text)
    : null;

  if (originalPost) return handleRevise(ctx, originalPost, text);

  // ── Unrecognised plain text ─────────────────────────────────────────────────
  await ctx.reply(
    '🎙 I process voice notes! Send me a *voice note* with your thoughts and I\'ll turn them into LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

/**
 * Revises an existing post based on text instructions.
 * The 3 new variations are sent as separate messages — no DB writes needed.
 */
async function handleRevise(ctx, originalPost, instructions) {
  const sanitised   = instructions.slice(0, 500).replace(/[`\\"]/g, "'");
  const thinkingMsg = await ctx.reply('✍️ Revising with Gemini… give me a moment.');

  try {
    const newStrings = await revisePosts(originalPost, sanitised);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await sendPostMessages(ctx, newStrings);
  } catch (err) {
    console.error('[text] handleRevise:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      `😔 Revision failed.\n\n${err.message.startsWith('[Gemini]') ? err.message : 'Please try again or send a new voice note.'}`
    );
  }
}

module.exports = { handleText };
