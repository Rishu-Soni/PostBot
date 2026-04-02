'use strict';

const axios  = require('axios');
const { Markup } = require('telegraf');
const User   = require('../models/User');
const { generatePosts } = require('../services/gemini');

/**
 * Marker embedded in the bot's ForceReply message after "✏️ Modify this".
 * When the user replies (text or voice), we find this marker to re-extract
 * the original post text — no DB state required.
 */
const MODIFY_MARKER = '✏️ Reply with what you\'d like to change:\n\n---\n';

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
async function sendPostMessages(ctx, posts) {
  if (!posts || posts.length === 0) return;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Post this',   'action_post'),
      Markup.button.callback('✏️ Modify this', 'action_modify'),
    ],
    [
      Markup.button.callback('📸 Attach Media & Post', 'action_attach_media'),
    ],
  ]);

  for (let i = 0; i < posts.length; i++) {
    await ctx.reply(
      `📝 Option ${i + 1} of ${posts.length}\n\n${posts[i]}`,
      keyboard
    );
  }
}

async function handleVoice(ctx) {
  if (!ctx.message?.voice || !ctx.from) return;

  const telegramId = String(ctx.from.id);
  const voice      = ctx.message.voice;

  // Check if this voice note is a reply to a "✏️ Modify this" ForceReply prompt.
  // If so, extract the original post text embedded after MODIFY_MARKER.
  const replyText = ctx.message.reply_to_message?.text ?? '';
  const modifyIdx = replyText.indexOf(MODIFY_MARKER);
  const originalPostText = modifyIdx !== -1
    ? replyText.slice(modifyIdx + MODIFY_MARKER.length).trim()
    : null;

  const user = await User.findOne({ telegramId });

  // A new voice note cancels any stale media-upload session.
  // Save only once, only if state was dirty.
  if (user?.inputState === 'awaiting_media_upload') {
    await User.updateOne(
      { telegramId },
      { $set: { inputState: 'idle', pendingPostText: null, pendingMediaIds: [], mediaDoneMessageId: null } }
    );
  }

  if (!user || !user.onboardingComplete) {
    return ctx.reply('⚠️ Please set up your preferences first. Send /start to begin.');
  }

  if (voice.duration > 120) {
    return ctx.reply(
      `⏱ Your voice note is *${voice.duration}s* long.\n\nPlease keep it under *120 seconds* and try again.`,
      { parse_mode: 'Markdown' }
    );
  }
  if (voice.file_size && voice.file_size > 10_485_760) {
    return ctx.reply(
      `📦 Voice note too large (${(voice.file_size / 1_048_576).toFixed(1)} MB). Please send a shorter recording.`
    );
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

  // Fetch the pinned message for layout reference (re-fetched each call so pin changes take effect immediately).
  let layoutExample = null;
  try {
    const chat = await ctx.telegram.getChat(ctx.chat.id);
    if (chat.pinned_message?.text) layoutExample = chat.pinned_message.text;
  } catch (err) {
    console.error('[voice] Could not fetch pinned message:', err.message);
  }

  const thinkingMsg = await ctx.reply(
    originalPostText
      ? '🔄 Refining your post with Gemini… this may take 15–30 seconds.'
      : '🎧 Got your voice note! Processing with Gemini… this may take 15–30 seconds.'
  );

  try {
    const fileLink    = await ctx.telegram.getFileLink(fileId);
    const audioResp   = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30_000 });
    const audioBuffer = Buffer.from(audioResp.data);

    // If a specific post is being revised, embed it in the refinement hint so
    // Gemini knows what to refine and listens to the voice for instructions.
    const refinementHint = originalPostText
      ? `The user wants to revise this specific post:\n"${originalPostText}"\n\nListen to the voice note for their modification instructions.`
      : null;

    const postStrings = await generatePosts(audioBuffer, {
      styles:       user.preferredStyles?.length ? user.preferredStyles : ['Punchy & Direct'],
      layout:       user.preferredLayout  || 'Short Para',
      tone:         user.preferredTone    || 'Professional',
      layoutExample,
    }, refinementHint);

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await sendPostMessages(ctx, postStrings);

  } catch (err) {
    console.error('[voice] Pipeline error:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      '😔 Something went wrong while processing your voice note.\n\n' +
      (err.message.startsWith('[Gemini]') ? err.message : 'Please try again in a moment.')
    );
  }
}

module.exports = { handleVoice, processGeneration, sendPostMessages, extractPostText, MODIFY_MARKER };
