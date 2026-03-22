'use strict';

const axios  = require('axios');
const { Markup } = require('telegraf');
const User   = require('../models/User');
const { generatePosts } = require('../services/gemini');

async function handleVoice(ctx) {
  if (!ctx.message?.voice) return;

  const telegramId = String(ctx.from.id);
  const voice      = ctx.message.voice;

  let refinementHint = null;
  const replyText = ctx.message.reply_to_message?.text;
  
  if (replyText && replyText.includes('Reply to this message with your instructions to modify this post:\n\n---')) {
    const parts = replyText.split('\n---\n');
    if (parts.length > 1) {
      const postText = parts.slice(1).join('\n---\n').trim();
      refinementHint = `The user wants to revise this specific post based on their voice note:\n"${postText}"`;
    }
  }

  // Double check user is fully onboarded since there are no sessions to track it
  const user = await User.findOne({ telegramId });
  if (!user || user.onboardingComplete !== true) {
    await ctx.reply('⚠️ Please complete the setup first, then send your voice note. Send /start to begin.');
    return;
  }

  if (voice.duration > 120) {
    return ctx.reply(`⏱ Your voice note is *${voice.duration}s* long.\n\nPlease keep it under *120 seconds* and try again.`, { parse_mode: 'Markdown' });
  }
  if (voice.file_size && voice.file_size > 10_485_760) {
    return ctx.reply(`📦 Voice note too large (${(voice.file_size / 1_048_576).toFixed(1)} MB). Please send a shorter recording.`);
  }

  await _process(ctx, voice.file_id, user, refinementHint);
}

async function _process(ctx, fileId, user, refinementHint) {
  const thinkingMsg = await ctx.reply(
    refinementHint
      ? '🔄 Refining your posts with Gemini… this may take 15–30 seconds.'
      : '🎧 Got your voice note! Processing with Gemini… this may take 15–30 seconds.'
  );

  try {
    const fileLink    = await ctx.telegram.getFileLink(fileId);
    const audioResp   = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30_000 });
    const audioBuffer = Buffer.from(audioResp.data);

    const postStrings = await generatePosts(audioBuffer, {
      styles: user.preferredStyles ?? ['Punchy & Direct', 'Storytelling', 'Analytical'],
      layout: user.preferredLayout ?? 'Single block',
      tone:   user.preferredTone   ?? 'Professional',
    }, refinementHint);

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply('✨ *Here are your 3 LinkedIn posts:*', { parse_mode: 'Markdown' });

    for (let i = 0; i < postStrings.length; i++) {
      await ctx.reply(
        `────── Option ${i + 1} ──────\n\n${postStrings[i]}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Post This Option', 'post_action')],
          [Markup.button.callback('🔄 Modify This Option', 'revise_action')],
        ])
      );
    }
  } catch (err) {
    console.error('[voice] Pipeline error:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      '😔 Something went wrong while processing your voice note.\n\n' +
      `${err.message.startsWith('[Gemini]') ? err.message : 'Please try again in a moment.'} ` +
      `If the problem persists, make sure your recording is under 2 minutes.`
    );
  }
}

module.exports = { handleVoice };
