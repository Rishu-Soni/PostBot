'use strict';

const axios  = require('axios');
const { Markup } = require('telegraf');
const User   = require('../models/User');
const { generatePosts } = require('../services/gemini');

const REVISION_MARKER = 'Reply to this message with your instructions to modify this post:\n\n---\n';

async function handleVoice(ctx) {
  if (!ctx.message?.voice || !ctx.from) return;

  const telegramId = String(ctx.from.id);
  const voice      = ctx.message.voice;

  // Detect if this voice note is a reply to a ForceReply revision prompt
  let refinementHint = null;
  const replyText = ctx.message.reply_to_message?.text ?? '';
  if (replyText) {
    const idx = replyText.indexOf(REVISION_MARKER);
    if (idx !== -1) {
      const postText = replyText.slice(idx + REVISION_MARKER.length).trim();
      refinementHint = `The user wants to revise this specific post based on their voice instructions:\n"${postText}"`;
    }
  }

  const user = await User.findOne({ telegramId });

  // Guard: user already in media-upload limbo from a previous incomplete session.
  // A fresh voice note cancels that stale state automatically.
  if (user?.inputState === 'awaiting_media_upload') {
    // Reset the stale state so the new voice note can proceed normally
    user.inputState        = 'idle';
    user.pendingMediaIds   = [];
    user.mediaDoneMessageId = null;
    user.selectedPostIndex  = null;
    await user.save();
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

  // Persist the new voice note file_id and reset ALL transient session state.
  // pendingMediaChoice is reset here so the media prompt is always shown fresh
  // for each new voice note submission — it will be set once when the user answers.
  user.pendingVoiceFileId    = voice.file_id;
  user.inputState            = 'idle';
  user.pendingMediaChoice    = 'nomedia';   // reset; will be overwritten by handleMediaChoice
  user.pendingMediaIds       = [];
  user.pendingRefinementHint = refinementHint ?? null;
  await user.save();

  // Ask once — set it and forget it.
  await ctx.reply(
    '📎 Would you like to attach any photos or videos to this post?',
    {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📸 Add Media',          'gen_choice:media'  ),
          Markup.button.callback('⏩ No Media, Continue', 'gen_choice:nomedia'),
        ],
      ]),
    }
  );
}

/**
 * Called by handleMediaChoice (actions.js) once the user has answered the media prompt.
 * `user.pendingMediaChoice` has already been persisted by the time this runs.
 */
async function processGeneration(ctx, user) {
  const fileId = user.pendingVoiceFileId;
  if (!fileId) return ctx.reply('⚠️ Could not find your voice note. Please send it again.');

  const refinementHint = user.pendingRefinementHint ?? null;

  // Dynamically fetch the pinned message as the structural layout reference.
  // This is re-fetched each generation so removing/changing the pin takes effect immediately.
  let layoutExample = null;
  try {
    const chat = await ctx.telegram.getChat(ctx.chat.id);
    if (chat.pinned_message?.text) {
      layoutExample = chat.pinned_message.text;
    }
  } catch (err) {
    console.error('[voice] Could not fetch pinned message:', err.message);
  }

  const thinkingMsg = await ctx.reply(
    refinementHint
      ? '🔄 Refining your post with Gemini… this may take 15–30 seconds.'
      : '🎧 Got your voice note! Processing with Gemini… this may take 15–30 seconds.'
  );

  try {
    const fileLink    = await ctx.telegram.getFileLink(fileId);
    const audioResp   = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30_000 });
    const audioBuffer = Buffer.from(audioResp.data);

    const postStrings = await generatePosts(audioBuffer, {
      styles:       user.preferredStyles?.length ? user.preferredStyles : ['Punchy & Direct'],
      layout:       user.preferredLayout  || 'Short Para',
      tone:         user.preferredTone    || 'Professional',
      layoutExample,
    }, refinementHint);

    // Persist the freshly generated posts and clear transient voice fields
    user.currentPosts          = postStrings;
    user.inputState            = 'idle';
    user.pendingVoiceFileId    = null;
    user.pendingRefinementHint = null;
    await user.save();

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

    // Render the first carousel slide; media choice is already in user.pendingMediaChoice
    await sendCarouselPost(ctx, postStrings, 0, user.pendingMediaChoice);

  } catch (err) {
    console.error('[voice] Pipeline error:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    user.inputState = 'idle';
    await user.save();
    await ctx.reply(
      '😔 Something went wrong while processing your voice note.\n\n' +
      (err.message.startsWith('[Gemini]') ? err.message : 'Please try again in a moment.')
    );
  }
}

/**
 * Renders (or edits) the carousel message for a given post index.
 *
 * @param {object} ctx          - Telegraf context
 * @param {string[]} posts      - Array of post strings
 * @param {number} currentIndex - Which post to display (0-based)
 * @param {string} mediaChoice  - 'media' → show "✅ Choose this"; 'nomedia' → show "✅ Post to LinkedIn"
 */
async function sendCarouselPost(ctx, posts, currentIndex, mediaChoice = 'nomedia') {
  if (!posts || posts.length === 0) return;
  const postText = posts[currentIndex];

  const row = [];

  // ⬅️ Prev — only when there's a previous post
  if (currentIndex > 0) {
    row.push(Markup.button.callback('⬅️ Prev', `carousel_prev:${currentIndex - 1}`));
  }

  // ✏️ Modify This — always present
  row.push(Markup.button.callback('✏️ Modify This', `carousel_mod:${currentIndex}`));

  // ✅ Action — depends on whether user wants to attach media
  if (mediaChoice === 'media') {
    row.push(Markup.button.callback('✅ Choose This', `carousel_choose_media:${currentIndex}`));
  } else {
    row.push(Markup.button.callback('✅ Post to LinkedIn', `carousel_post:${currentIndex}`));
  }

  // Next ➡️ — only when there's a next post
  if (currentIndex < posts.length - 1) {
    row.push(Markup.button.callback('Next ➡️', `carousel_next:${currentIndex + 1}`));
  }

  const text  = `────── Option ${currentIndex + 1} of ${posts.length} ──────\n\n${postText}`;
  const extra = { ...Markup.inlineKeyboard([row]) };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, extra).catch(e => {
      if (!e.message?.includes('message is not modified')) throw e;
    });
  } else {
    await ctx.reply(text, extra);
  }
}

module.exports = { handleVoice, processGeneration, sendCarouselPost };
