'use strict';

const User = require('../models/User');
const { revisePosts, generateDummyPost } = require('../services/gemini');
const { sendPostMessages, MODIFY_MARKER } = require('./voice');
const { escapeMarkdownV2 } = require('../utils/formatters');

/**
 * Extracts the original post text from a ForceReply message.
 * The bot embeds it after MODIFY_MARKER when the user clicks "✏️ Modify this".
 */
/**
 * R-01: Uses lastIndexOf so we handle any edge-case where the marker appears
 * more than once. Slices everything BEFORE the marker — the post text now comes
 * first, marker is appended at the end by handleActionModify.
 */
function extractOriginalPost(replyText) {
  const idx = replyText.lastIndexOf(MODIFY_MARKER);
  if (idx === -1) return null;
  return replyText.slice(0, idx).trim();
}

async function handleText(ctx) {
  const text = ctx.message?.text?.trim() ?? '';
  if (!text || text.startsWith('/')) return;

  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  // ── Setstyle: Provide Example Post ────────────────────────────────────────
  // User pasted a real LinkedIn post — pin it directly, no AI needed.
  if (user?.inputState === 'awaiting_upload_example') {
    if (text.length < 80) {
      return ctx.reply(
        '⚠️ That post is too short to be a good template.\n\n' +
        'Please paste a *full LinkedIn post* (at least 80 characters) that accurately reflects your desired layout and vibe.',
        { parse_mode: 'Markdown' }
      );
    }

    // V-04: Separate the pin call from the rest so we can inspect the error.
    try {
      await ctx.pinChatMessage(ctx.message.message_id, { disable_notification: true });
    } catch (pinErr) {
      const desc = pinErr?.description ?? pinErr?.message ?? '';
      if (desc.includes('not enough rights')) {
        return ctx.reply(
          '⚠️ I need the *"Pin Messages"* admin permission to save your style template.\n\n' +
          'Please grant me that permission in the chat settings and send your example post again.',
          { parse_mode: 'Markdown' }
        );
      }
      // Non-fatal error (e.g. already pinned): log and continue.
      console.warn('[text] pinChatMessage non-fatal error:', desc);
    }

    try {
      user.inputState = 'idle';
      user.onboardingComplete = true;
      await user.save();

      await ctx.reply(
        `✅ *Style template pinned!*\n\n` +
        `I'll use this post as the structural blueprint for every future generation — mirroring its layout, tone, and emoji style exactly.\n\n` +
        `💡 *Pro Tip:* Want to tweak it? Use Telegram's native *Edit* feature on the pinned message — I always read the latest version.\n\n` +
        `🎙 Ready! Send me a *voice note* to generate your first post.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[text] Error saving user after pin:', err);
      await ctx.reply('😔 Something went wrong saving your settings. Please try again.');
    }
    return;
  }

  // ── Setstyle: Manual Setup (Text) ──────────────────────────────────────────
  // User described their vibe in text — send to Gemini to generate a dummy post, then pin it.
  if (user?.inputState === 'awaiting_describe_vibe') {
    const thinkingMsg = await ctx.reply('✍️ Generating your template post based on your description...');
    try {
      const dummyPost = await generateDummyPost(text, false);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

      const sentMsg = await ctx.reply(escapeMarkdownV2(dummyPost), { parse_mode: 'MarkdownV2' });

      // Pin the generated template; handle permission errors gracefully.
      try {
        await ctx.pinChatMessage(sentMsg.message_id, { disable_notification: true });
      } catch (pinErr) {
        const desc = pinErr?.description ?? pinErr?.message ?? '';
        if (desc.includes('not enough rights')) {
          return ctx.reply(
            '⚠️ I need the *"Pin Messages"* admin permission to save your style template.\n\n' +
            'Please grant me that permission in the chat settings and then run /setstyle again.',
            { parse_mode: 'Markdown' }
          );
        }
        console.warn('[text] pinChatMessage non-fatal error:', desc);
      }

      user.inputState = 'idle';
      user.onboardingComplete = true;
      await user.save();

      await ctx.reply(
        `✅ *Style template generated and pinned!*\n\n` +
        `I'll use this post as the structural blueprint for every future generation — mirroring its layout, tone, and emoji style exactly.\n\n` +
        `💡 *Pro Tip:* Not quite right? Use Telegram's native *Edit* feature on the pinned message to fine-tune it — I always read the latest version.\n\n` +
        `🎙 Ready! Send me a *voice note* to generate your first post.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('[text] Error handling vibe description:', err);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
      await ctx.reply('😔 Something went wrong generating your template post. Please try again or use /setstyle.');
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
  const sanitised = instructions.slice(0, 500).replace(/[`\\"]/g, "'");

  // V-03: Reject instructions that are too brief to be meaningful.
  if (sanitised.length < 5) {
    return ctx.reply(
      '⚠️ That instruction is too brief. Please describe in a little more detail how you want the post changed (at least 5 characters).'
    );
  }

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
