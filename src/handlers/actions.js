'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken } = require('../services/linkedin');
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

async function handlePostAction(ctx) {
  const telegramId = String(ctx.from.id);
  const postId     = ctx.match[1]; // full ID string: telegramId_YYYYMMDD_HHMMSS_index
  const session    = getSession(telegramId);

  if (!session.posts || session.posts.length < 3) {
    return ctx.answerCbQuery('⚠️ Session expired — send a new voice note.', { show_alert: true });
  }

  const post = session.posts.find(p => p.id === postId);
  if (!post) {
    return ctx.answerCbQuery('⚠️ Could not find that post. Please try again.', { show_alert: true });
  }

  await ctx.answerCbQuery('⏳ Working on it…');

  try {
    const user = await User.findOne({ telegramId });
    if (!user) return ctx.reply('⚠️ Your account was not found. Please send /start to re-register.');

    let accessToken;
    try {
      accessToken = await getValidAccessToken(user);
    } catch (tokenErr) {
      if (tokenErr.message === 'NOT_CONNECTED')
        return ctx.reply('🔗 *LinkedIn not connected yet!*\n\nSend /connect to link your LinkedIn account, then tap the button again.', { parse_mode: 'Markdown' });
      if (tokenErr.message === 'TOKEN_EXPIRED')
        return ctx.reply('🔒 Your LinkedIn session has expired.\n\nSend /connect to re-authorise and try again.', { parse_mode: 'Markdown' });
      throw tokenErr;
    }

    const { postUrl } = await postToLinkedIn(accessToken, post.text);
    updateSession(telegramId, { step: STEPS.WAITING_VOICE, posts: [], temp: {} });
    await ctx.reply(
      `🎉 *Your post is live on LinkedIn!*\n\n[View your post →](${postUrl})\n\n_Ready for your next idea? Send another voice note!_`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('[actions] handlePostAction:', err.message);
    await ctx.reply(
      '😔 Failed to post to LinkedIn.\n\n' +
      (err.message.startsWith('[LinkedIn]') ? err.message : 'An unexpected error occurred.') +
      '\n\nPlease try again, or send /connect to re-link your account.'
    );
  }
}

async function handleRevisePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const postId     = ctx.match[1]; // full ID string
  const session    = getSession(telegramId);

  if (!session.posts || session.posts.length < 3) {
    return ctx.reply('⚠️ Session expired. Please send a new voice note first.');
  }

  const post = session.posts.find(p => p.id === postId);
  if (!post) return ctx.reply('⚠️ Could not find that post. Please try again.');

  updateSession(telegramId, {
    step: STEPS.WAITING_REVISE_INPUT,
    temp: { ...session.temp, revisePostId: postId },
  });

  await ctx.reply(
    `✏️ *Modifying a post*\n\n` +
    `Tell me how you'd like it changed — type your instructions below.\n\n` +
    `_Examples: "Make it shorter and punchier" or "Add a statistic about remote work"_`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { handlePostAction, handleRevisePick };
