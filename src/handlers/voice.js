// src/handlers/voice.js
// ─────────────────────────────────────────────────────────────────────────────
// Voice message handler — the core pipeline of Postbot.
//
// PIPELINE
//   1. Guard: only process if session.step === 'waiting_voice'
//   2. Validate: file size and duration limits
//   3. Download audio from Telegram CDN (axios arraybuffer)
//   4. Load user preferences from MongoDB
//   5. Send audio + preferences to Gemini → 3 posts
//   6. Store posts in session for later recall by action handlers
//   7. Send posts to user with 4-button inline keyboard
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const axios  = require('axios');
const { Markup } = require('telegraf');
const User   = require('../models/User');
const { generatePosts } = require('../services/gemini');
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

const MAX_VOICE_DURATION_SECONDS = 120;        // 2 minutes
const MAX_VOICE_FILE_SIZE_BYTES  = 10_485_760; // 10 MB

/**
 * Handles incoming voice messages.
 * Only acts when the user's session is in the WAITING_VOICE state.
 * Delegates to _generateAndSend for shared logic with the refine flow.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleVoice(ctx) {
  if (!ctx.message?.voice) return; // guard against malformed updates

  const telegramId = String(ctx.from.id);
  const session    = getSession(telegramId);

  // ── State guard ───────────────────────────────────────────────────────────
  // If the user is in onboarding or refine-input mode, a voice note should be
  // handled by the refine handler, not here.
  if (session.step === STEPS.WAITING_REVISE_INPUT) {
    // Delegate to the refine logic — the voice note IS the refinement instruction.
    // We re-use this handler for the audio transcription; the refine handler
    // will call us back via the shared pipeline.
    await handleRefineVoice(ctx);
    return;
  }

  if (session.step !== STEPS.WAITING_VOICE) {
    // User sent a voice note at the wrong time (e.g. during onboarding).
    await ctx.reply(
      '⚠️ Please complete the setup first, then send your voice note.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const voice = ctx.message.voice;

  // ── Validation ────────────────────────────────────────────────────────────
  if (voice.duration > MAX_VOICE_DURATION_SECONDS) {
    return ctx.reply(
      `⏱ Your voice note is *${voice.duration}s* long.\n\n` +
      `Please keep it under *${MAX_VOICE_DURATION_SECONDS} seconds* and try again.`,
      { parse_mode: 'Markdown' }
    );
  }
  if (voice.file_size && voice.file_size > MAX_VOICE_FILE_SIZE_BYTES) {
    return ctx.reply(
      `📦 Voice note too large (${(voice.file_size / 1_048_576).toFixed(1)} MB).\n\n` +
      `Please send a shorter recording.`
    );
  }

  await _generateAndSend(ctx, voice.file_id, telegramId, null);
}

/**
 * Handles a voice note sent as a refinement instruction.
 * Transcription-side: the audio is processed by Gemini with a refinementHint
 * derived from the voice note itself.
 *
 * @param {import('telegraf').Context} ctx
 */
async function handleRefineVoice(ctx) {
  const telegramId = String(ctx.from.id);
  const voice      = ctx.message?.voice;
  if (!voice) return;

  const session = getSession(telegramId);

  // The refinement target (which option: 0/1/2) is stored in session.temp.
  const targetIndex = session.temp?.reviseTargetIndex ?? null;

  // Download the voice note and use it directly as the refinement audio.
  // We pass a refinementHint extracted from session.temp if the user also
  // typed instructions (text path). For voice-only refinement, the "hint" is
  // embedded in the audio itself — we tell Gemini to treat it as revision input.
  const hint = targetIndex !== null
    ? `The user wants to revise Option ${targetIndex + 1} based on this voice note.`
    : 'The user wants to revise their previous posts based on this voice note.';

  await _generateAndSend(ctx, voice.file_id, telegramId, hint);
}

/**
 * Shared pipeline: download audio, call Gemini, send 4-button result.
 *
 * @param {import('telegraf').Context} ctx
 * @param {string}      fileId       - Telegram file_id
 * @param {string}      telegramId
 * @param {string|null} refinementHint - null for normal; string for refine mode
 */
async function _generateAndSend(ctx, fileId, telegramId, refinementHint) {
  // Show a typing indicator while processing.
  const thinkingMsg = await ctx.reply(
    refinementHint
      ? '🔄 Refining your posts with Gemini… this may take 15–30 seconds.'
      : '🎧 Got your voice note! Processing with Gemini… this may take 15–30 seconds.'
  );

  try {
    // ── Download audio ────────────────────────────────────────────────────
    const fileLink  = await ctx.telegram.getFileLink(fileId);
    const audioResp = await axios.get(fileLink.href, {
      responseType: 'arraybuffer',
      timeout:      30_000,
    });
    const audioBuffer = Buffer.from(audioResp.data);

    // ── Load user preferences ─────────────────────────────────────────────
    let user = await User.findOne({ telegramId });
    if (!user) {
      // Edge case: user skipped /start. Create a minimal record.
      user = await User.findOneAndUpdate(
        { telegramId },
        { $setOnInsert: { telegramId, firstName: ctx.from.first_name || '' } },
        { upsert: true, new: true }
      );
    }

    const preferences = {
      styles: user.preferredStyles ?? ['Punchy & Direct', 'Storytelling', 'Analytical'],
      layout: user.preferredLayout ?? 'Single block',
      tone:   user.preferredTone   ?? 'Professional',
    };

    // ── Call Gemini ───────────────────────────────────────────────────────
    const posts = await generatePosts(audioBuffer, preferences, refinementHint);

    // Store posts in session so action handlers can retrieve the full text.
    updateSession(telegramId, {
      step:  STEPS.WAITING_VOICE, // back to ready state
      posts,
      temp:  {},
    });

    // ── Send individual posts with attached buttons ───────────────────────────
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

    await ctx.reply('✨ *Here are your 3 LinkedIn posts:*', { parse_mode: 'Markdown' });

    for (let i = 0; i < posts.length; i++) {
      const postText = `────── Option ${i + 1} ──────\n\n${posts[i]}`;
      
      const perPostKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Post This Option', `post_${i}`)],
        [Markup.button.callback('🔄 Modify This Option', `revise_pick_${i}`)]
      ]);

      // IMPORTANT: no parse_mode on post bodies — AI content may contain
      // special Markdown characters that would break the parser.
      await ctx.reply(postText, perPostKeyboard);
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

module.exports = { handleVoice, handleRefineVoice, _generateAndSend };
