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

  // Detect if this is a voice reply to a Force-Reply revision prompt
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

  // Guard: user already has a pending voice note awaiting media upload
  if (user?.inputState === 'awaiting_media_upload') {
    return ctx.reply(
      '⚠️ You already have a pending voice note waiting for media.\n\n' +
      'Please click *Done and post* on the previous prompt first.\n\n' +
      'Or send /generate to discard it and start over.',
      { parse_mode: 'Markdown' }
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

  // Save voice file_id and reset media queue
  user.pendingVoiceFileId = voice.file_id;
  user.inputState = 'idle';
  user.pendingMediaIds = [];
  // Store revision hint in its dedicated field
  user.pendingRefinementHint = refinementHint || null;
  await user.save();

  await ctx.reply(
    'Would you like to attach media to this post?',
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Add media', 'gen_choice:media'), Markup.button.callback('Continue without one', 'gen_choice:nomedia')]
      ])
    }
  );
}

async function processGeneration(ctx, user, mediaChoice = 'nomedia') {
  const fileId = user.pendingVoiceFileId;
  if (!fileId) return ctx.reply('⚠️ Could not find your voice note. Please send it again.');

  const refinementHint = user.pendingRefinementHint || null;
  // Dynamically fetch pinned example text
  let layoutExample = null;
  try {
    const chat = await ctx.telegram.getChat(ctx.chat.id);
    if (chat.pinned_message?.text) {
      layoutExample = chat.pinned_message.text;
    }
  } catch (err) {
    console.error('[voice] Could not fetch chat data for pinned message:', err.message);
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

    user.currentPosts          = postStrings;
    user.inputState            = 'idle';
    user.pendingVoiceFileId    = null;
    user.pendingRefinementHint = null;
    await user.save();

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await sendCarouselPost(ctx, postStrings, 0, mediaChoice);

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
 * Renders the single carousel message for the given index.
 * When called from a callback (navigation), it edits the existing message.
 * When called fresh, it sends a new message.
 */
async function sendCarouselPost(ctx, posts, currentIndex, mediaChoice = 'nomedia') {
  if (!posts || posts.length === 0) return;
  const postText = posts[currentIndex];

  // Build a flat row of buttons; Prev and Next are conditional on position
  const row = [];
  if (currentIndex > 0) {
    row.push(Markup.button.callback('⬅️ Prev', `carousel_prev:${currentIndex - 1}`));
  }
  row.push(Markup.button.callback('✏️ Modify This', `carousel_mod:${currentIndex}`));
  
  if (mediaChoice === 'media') {
    row.push(Markup.button.callback('✅ Choose this', `carousel_choose_media:${currentIndex}`));
  } else {
    row.push(Markup.button.callback('✅ Post to LinkedIn', `carousel_post:${currentIndex}`));
  }

  if (currentIndex < posts.length - 1) {
    row.push(Markup.button.callback('Next ➡️', `carousel_next:${currentIndex + 1}`));
  }

  const text  = `────── Option ${currentIndex + 1} of ${posts.length} ──────\n\n${postText}`;
  const extra = { parse_mode: 'Markdown', ...Markup.inlineKeyboard([row]) };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, extra).catch(e => {
      if (!e.message?.includes('message is not modified')) throw e;
    });
  } else {
    await ctx.reply(text, extra);
  }
}

module.exports = { handleVoice, processGeneration, sendCarouselPost };
