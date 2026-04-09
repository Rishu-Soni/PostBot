'use strict';

const axios  = require('axios');
const { Markup } = require('telegraf');
const User   = require('../models/User');
const { generatePosts, generateDummyPost } = require('../services/gemini');
const { escapeMarkdownV2 } = require('../utils/formatters');

const DEFAULT_EXEMPLAR_POST = `Why do 90% of to-do lists fail by Wednesday?

Because we treat our days like storage units—stuffing them until they break.

I used to start every morning with 15 "critical" tasks.
By 5 PM, I was exhausted, having only finished 3. 

Then I changed one rule: 

I stopped writing to-do lists, and started writing a "Will-Do" list.

Here is the 3-step framework:
• The Anchor: 1 massive task that moves the needle.
• The Maintenance: 2 quick admin tasks to keep the lights on.
• The Cutoff: A hard stop at 6 PM. Everything else gets deleted or delegated.

Productivity isn't about doing more things faster. 
It’s about doing fewer things, better.

What is the 1 task anchoring your day today? 

#productivity #focus #careergrowth #timemanagement #founder`;

/**
 * Marker appended to the END of the ForceReply message by handleActionModify.
 * Invisible to the user but preserved by Telegram's API (\u2060 = Word Joiner,
 * a non-printable, non-strippable Unicode character).
 * Extraction uses lastIndexOf + slice(0, idx) so we take text BEFORE the marker.
 */
const MODIFY_MARKER = '\n\n\u2060POSTBOT_MARKER\u2060\n';

/**
 * Strips the "📝 Option X of 3\n\n" header from a post message to get clean post text.
 * Works for any message that starts with the option prefix.
 */
function extractPostText(msgText) {
  if (!msgText) return '';
  const sep = msgText.indexOf('\n\n');
  return sep !== -1 ? msgText.slice(sep + 2).trim() : msgText.trim();
}

/**
 * Sends 3 post options as separate Telegram messages.
 * Each message has two rows of inline buttons:
 *   Row 1: [✅ Post this]  [✏️ Modify this]
 *   Row 2: [📸 Attach Media & Post]
 */
async function sendPostMessages(ctx, posts, usingDefaultStyle = false) {
  if (!posts || posts.length === 0) return;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🚀 Publish to LinkedIn',   'action_post'),
      Markup.button.callback('✏️ Refine', 'action_modify'),
    ],
    [
      Markup.button.callback('📸 Add Media', 'action_attach_media'),
    ],
  ]);

  for (let i = 0; i < posts.length; i++) {
    // Escape ONLY the raw Gemini content. The header is plain ASCII, safe for MarkdownV2.
    const escapedPost = escapeMarkdownV2(posts[i]);
    let messageText = `📝 Option ${i + 1} of ${posts.length}\n\n${escapedPost}`;

    // Append the fallback warning to the final message only.
    // The hardcoded string must have . and ! manually escaped for MarkdownV2.
    if (i === posts.length - 1 && usingDefaultStyle) {
      messageText += `\n\n_⚠️ Note: I couldn't find a pinned style template in this chat, so I used the default style\. Use /setstyle to create a custom one\!_`;
    }

    await ctx.reply(messageText, { parse_mode: 'MarkdownV2', ...keyboard });
  }
}

async function handleVoice(ctx) {
  if (!ctx.message?.voice || !ctx.from) return;

  const telegramId = String(ctx.from.id);
  const voice      = ctx.message.voice;

  // Check if this voice note is a reply to a "✏️ Refine" ForceReply prompt.
  // Marker is appended at the END of the message; we slice everything BEFORE it.
  const replyText = ctx.message.reply_to_message?.text ?? '';
  const modifyIdx = replyText.lastIndexOf(MODIFY_MARKER);
  const originalPostText = modifyIdx !== -1
    ? replyText.slice(0, modifyIdx).trim()
    : null;

  const user = await User.findOne({ telegramId });

  // ── Smart Onboarding: Describe Vibe (Voice) ────────────────────────────────
  if (user?.inputState === 'awaiting_describe_vibe') {
    const thinkingMsg = await ctx.reply('✍️ Generating your dummy template post based on your voice vibe...');
    try {
      const fileLink    = await ctx.telegram.getFileLink(voice.file_id);
      const audioResp   = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30_000 });
      const audioBuffer = Buffer.from(audioResp.data);

      const dummyPost = await generateDummyPost(audioBuffer, true);
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
      console.error('[voice] Error handling vibe description:', err);
      await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
      await ctx.reply('😔 Something went wrong generating your dummy post. Please try again or use /setstyle.');
    }
    return;
  }

  // A new voice note cancels any stale media-upload session.
  // Save only once, only if state was dirty.
  if (user?.inputState === 'awaiting_media_upload') {
    await User.updateOne(
      { telegramId },
      { $set: { inputState: 'idle', pendingPostText: null, pendingMediaIds: [], mediaDoneMessageId: null } }
    );
  }

  if (!user || !user.onboardingComplete) {
    return ctx.reply('⚠️ Please set up your preferences first by running /setstyle.');
  }

  if (voice.duration > 120 || (voice.file_size && voice.file_size > 10485760)) {
    return ctx.reply('⚠️ Your voice note is too long! Please keep it under 2 minutes so I can process it quickly.');
  }

  return processGeneration(ctx, user, voice.file_id, originalPostText);
}

/**
 * Downloads the voice note, calls Gemini, and sends 3 separate post messages.
 * When `originalPostText` is provided, the voice note is treated as modification
 * instructions for that specific post.
 */
async function processGeneration(ctx, user, fileId, originalPostText = null) {
  if (!fileId) return ctx.reply('⚠️ Could not find your voice note. Please send it again.');

  // ── Rate Limiter (moved here so it doesn't block the /setstyle vibe flow) ──
  if (user.lastGenerationAt && (Date.now() - user.lastGenerationAt.getTime() < 30_000)) {
    return ctx.reply('⏳ Whoa, slow down! Let me finish your previous post. Please wait 30 seconds between generations.');
  }
  user.lastGenerationAt = new Date();
  await user.save();

  // Fetch the pinned message for layout reference.
  // We use this as a Few-Shot Exemplar template.
  let layoutExample = DEFAULT_EXEMPLAR_POST;
  let usingDefaultStyle = true;
  
  try {
    const chat = await ctx.telegram.getChat(ctx.chat.id);
    if (chat.pinned_message?.text) {
      layoutExample = chat.pinned_message.text;
      usingDefaultStyle = false;
    }
  } catch (err) {
    console.error('[voice] Could not fetch pinned message:', err.message);
  }

  const thinkingMsg = await ctx.reply(
    originalPostText
      ? '🔄 Refining your post with Gemini… this may take a moment.'
      : '🎙️ Listening to your voice note and writing your posts...'
  );

  await ctx.sendChatAction('typing').catch(() => {});

  try {
    const fileLink    = await ctx.telegram.getFileLink(fileId);
    const audioResp   = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30_000 });
    const audioBuffer = Buffer.from(audioResp.data);

    // If a specific post is being revised, embed it in the refinement hint so
    // Gemini knows what to refine and listens to the voice for instructions.
    const refinementHint = originalPostText
      ? `[ORIGINAL POST CONTENT]:\n"${originalPostText}"\n\n[USER REFINEMENT INSTRUCTION]:\nListen to the voice note for their modification instructions.`
      : null;

    const postStrings = await generatePosts(audioBuffer, {
      layoutExample,
    }, refinementHint);

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await sendPostMessages(ctx, postStrings, usingDefaultStyle);

  } catch (err) {
    console.error('[voice] Pipeline error:', err.message);
    // Reset the rate limit stamp so a genuine failure doesn't lock the user out for 30s.
    try {
      user.lastGenerationAt = null;
      await user.save();
    } catch (_) { /* best-effort */ }
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      '😔 Something went wrong while processing your voice note.\n\n' +
      (err.message.startsWith('[Gemini]') ? err.message : 'Please try again in a moment.')
    );
  }
}

module.exports = { handleVoice, processGeneration, sendPostMessages, extractPostText, MODIFY_MARKER };
