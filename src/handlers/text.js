'use strict';

const User = require('../models/User');
const { revisePosts, generateDummyPost } = require('../services/gemini');
const { sendPostMessages, MODIFY_MARKER } = require('./voice');
const { escapeMarkdownV2 } = require('../utils/formatters');

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

  // ── Smart Onboarding: Upload Example ───────────────────────────────────────
  if (user?.inputState === 'awaiting_upload_example') {
    if (text.length < 80) {
      return ctx.reply(
        '⚠️ That post is too short to be a good template.\n\n' +
        'Please paste a *full LinkedIn post* that accurately reflects your desired layout and vibe.',
        { parse_mode: 'Markdown' }
      );
    }

    try {
      await ctx.pinChatMessage(ctx.message.message_id, { disable_notification: true }).catch(() => {});

      user.inputState = 'idle';
      user.onboardingComplete = true;
      await user.save();

      await ctx.reply(
        `✅ *Style locked in and pinned to the top of this chat!*\n\n` +
        `I will use this exact post as a blueprint for all future posts.\n\n` +
        `💡 *Pro Tip:* Don't like a specific word or emoji in the template? Just use Telegram's native 'Edit' feature to change the pinned message. I will always read the latest version!\n\n` +
        `🎙 Send a *voice note* now to get started.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[text] Error pinning upload example:', err);
      await ctx.reply('😔 Could not pin the message. Make sure I have admin rights to pin!');
    }
    return;
  }

  // ── Smart Onboarding: Describe Vibe (Text) ─────────────────────────────────
  if (user?.inputState === 'awaiting_describe_vibe') {
    const thinkingMsg = await ctx.reply('✍️ Generating your dummy template post based on your vibe...');
    try {
      const dummyPost = await generateDummyPost(text, false);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

      const sentMsg = await ctx.reply(escapeMarkdownV2(dummyPost), { parse_mode: 'MarkdownV2' });
      await ctx.pinChatMessage(sentMsg.message_id, { disable_notification: true }).catch(() => {});

      user.inputState = 'idle';
      user.onboardingComplete = true;
      await user.save();

      await ctx.reply(
        `✅ *Style locked in and pinned to the top of this chat!*\n\n` +
        `I will use this exact post as a blueprint for all future posts.\n\n` +
        `💡 *Pro Tip:* Don't like a specific word or emoji in the template? Just use Telegram's native 'Edit' feature to change the pinned message. I will always read the latest version!\n\n` +
        `🎙 Send a *voice note* now to get started.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[text] Error handling vibe description:', err);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
      await ctx.reply('😔 Something went wrong generating your dummy post. Please try again or use /setstyle.');
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
