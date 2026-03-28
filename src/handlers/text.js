'use strict';

const { Markup }  = require('telegraf');
const User        = require('../models/User');
const { revisePosts, extractPreferences } = require('../services/gemini');
const { sendCarouselPost } = require('./voice');

const REVISION_MARKER = 'Reply to this message with your instructions to modify this post:\n\n---\n';

function extractFromReply(replyText) {
  const idx = replyText.indexOf(REVISION_MARKER);
  if (idx === -1) return null;
  return replyText.slice(idx + REVISION_MARKER.length).trim();
}

async function handleText(ctx) {
  const text = ctx.message?.text?.trim() ?? '';
  if (!text || text.startsWith('/')) return;

  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  // ── Smart Onboarding: Example Analysis ─────────────────────────────────────
  if (user?.inputState === 'awaiting_example') {
    const thinkingMsg = await ctx.reply('🔍 Analyzing your post format, style, and tone...');
    try {
      // Pin the message so the bot can always reference the layout later
      await ctx.pinChatMessage(ctx.message.message_id, { disable_notification: true }).catch(() => {});

      const prefs = await extractPreferences(text);

      user.preferredTone     = prefs.preferredTone    || 'Professional';
      user.preferredStyles   = prefs.preferredStyles?.length ? prefs.preferredStyles : ['Punchy & Direct'];
      user.preferredLayout   = 'Short Para'; // Default structural layout label; layout driven by dynamically pinned message
      user.inputState        = 'idle';
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
        '😔 I had trouble analyzing that text. Please try again or use /setStyle for manual setup.'
      );
    }
    return;
  }

  // ── Revision via ForceReply ─────────────────────────────────────────────────
  const postText = ctx.message.reply_to_message?.text
    ? extractFromReply(ctx.message.reply_to_message.text)
    : null;

  if (postText) return handleRevise(ctx, postText, text, user);

  // ── Unrecognised plain text ─────────────────────────────────────────────────
  await ctx.reply(
    '🎙 I process voice notes! Send me a *voice note* with your thoughts and I\'ll turn them into LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

async function handleRevise(ctx, postText, instructions, user) {
  const sanitised   = instructions.slice(0, 500).replace(/[`\\"]/g, "'");
  const thinkingMsg = await ctx.reply('✍️ Revising with Gemini… give me a moment.');

  try {
    const newStrings = await revisePosts(postText, sanitised);

    // Save revised posts to DB so Carousel nav works
    if (user) {
      user.currentPosts = newStrings;
      await user.save();
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    // Display revised posts in the same Carousel UI
    await sendCarouselPost(ctx, newStrings, 0);
  } catch (err) {
    console.error('[text] handleRevise:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      `😔 Revision failed.\n\n${err.message.startsWith('[Gemini]') ? err.message : 'Please try again or send a new voice note.'}`
    );
  }
}

module.exports = { handleText };
