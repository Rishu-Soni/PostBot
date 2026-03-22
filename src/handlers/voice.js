'use strict';

const axios  = require('axios');
const { Markup } = require('telegraf');
const User   = require('../models/User');
const { generatePosts } = require('../services/gemini');
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

// ID: telegramId_YYYYMMDD_HHMMSS_index  e.g. 987654321_20260322_235331_0
function makePostId(telegramId, index) {
  const now = new Date();
  const d = now.toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss (no ms)
  return `${telegramId}_${d.slice(0, 8)}_${d.slice(8, 14)}_${index}`;
}

async function handleVoice(ctx) {
  if (!ctx.message?.voice) return;

  const telegramId = String(ctx.from.id);
  const session    = getSession(telegramId);
  const voice      = ctx.message.voice;

  if (session.step === STEPS.WAITING_REVISE_INPUT) {
    const hint = session.temp?.revisePostId
      ? `The user wants to revise the post with ID ${session.temp.revisePostId} based on this voice note.`
      : 'The user wants to revise their previous post based on this voice note.';
    await _process(ctx, voice.file_id, telegramId, hint);
    return;
  }

  if (session.step !== STEPS.WAITING_VOICE) {
    await ctx.reply('⚠️ Please complete the setup first, then send your voice note.');
    return;
  }

  if (voice.duration > 120) {
    return ctx.reply(`⏱ Your voice note is *${voice.duration}s* long.\n\nPlease keep it under *120 seconds* and try again.`, { parse_mode: 'Markdown' });
  }
  if (voice.file_size && voice.file_size > 10_485_760) {
    return ctx.reply(`📦 Voice note too large (${(voice.file_size / 1_048_576).toFixed(1)} MB). Please send a shorter recording.`);
  }

  await _process(ctx, voice.file_id, telegramId, null);
}

async function _process(ctx, fileId, telegramId, refinementHint) {
  const thinkingMsg = await ctx.reply(
    refinementHint
      ? '🔄 Refining your posts with Gemini… this may take 15–30 seconds.'
      : '🎧 Got your voice note! Processing with Gemini… this may take 15–30 seconds.'
  );

  try {
    const fileLink    = await ctx.telegram.getFileLink(fileId);
    const audioResp   = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 30_000 });
    const audioBuffer = Buffer.from(audioResp.data);

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.findOneAndUpdate(
        { telegramId },
        { $setOnInsert: { telegramId, firstName: ctx.from.first_name || '' } },
        { upsert: true, new: true }
      );
    }

    const postStrings = await generatePosts(audioBuffer, {
      styles: user.preferredStyles ?? ['Punchy & Direct', 'Storytelling', 'Analytical'],
      layout: user.preferredLayout ?? 'Single block',
      tone:   user.preferredTone   ?? 'Professional',
    }, refinementHint);

    // Wrap each string in an {id, text} object for ID-based lookups
    const posts = postStrings.map((text, i) => ({ id: makePostId(telegramId, i), text }));

    updateSession(telegramId, { step: STEPS.WAITING_VOICE, posts, temp: {} });

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply('✨ *Here are your 3 LinkedIn posts:*', { parse_mode: 'Markdown' });

    for (const post of posts) {
      await ctx.reply(
        `────── Option ${posts.indexOf(post) + 1} ──────\n\n${post.text}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Post This Option', `post_${post.id}`)],
          [Markup.button.callback('🔄 Modify This Option', `revise_pick_${post.id}`)],
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

module.exports = { handleVoice, makePostId };
