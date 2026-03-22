'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken, buildAuthUrl } = require('../services/linkedin');

const REVISION_MARKER = 'Reply to this message with your instructions to modify this post:\n\n---\n';
const LINKEDIN_ENABLED = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'].every(k => process.env[k]);

// Strip the "────── Option N ──────\n\n" header from a post message.
function extractPostText(messageText) {
  if (!messageText) return '';
  return messageText.replace(/^────── Option \d+ ──────\s+/, '');
}

async function handlePostAction(ctx) {
  // Guard: message payload can be absent on very old or forwarded callbacks
  const messageText = ctx.callbackQuery?.message?.text ?? '';
  const postText    = extractPostText(messageText);

  if (!postText) {
    return ctx.answerCbQuery('⚠️ Could not read the post text. Please try again.', { show_alert: true });
  }

  await ctx.answerCbQuery('⏳ Working on it…');

  try {
    const telegramId = String(ctx.from.id);
    const user       = await User.findOne({ telegramId });
    if (!user) return ctx.reply('⚠️ Your account was not found. Please send /start to re-register.');

    let accessToken;
    try {
      accessToken = await getValidAccessToken(user);
    } catch (tokenErr) {
      if (tokenErr.message === 'NOT_CONNECTED' || tokenErr.message === 'TOKEN_EXPIRED') {
        if (!LINKEDIN_ENABLED) {
          return ctx.reply('⚠️ LinkedIn integration is not configured on this server.');
        }
        const prompt = tokenErr.message === 'TOKEN_EXPIRED'
          ? '🔒 *LinkedIn session expired.*\n\nRe-authorise to continue posting:'
          : '🔗 *LinkedIn not connected yet!*\n\nLink your account to start posting:';
        return ctx.reply(
          `${prompt}\n\n[👉 Connect LinkedIn](${buildAuthUrl(String(ctx.from.id))})`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      }
      throw tokenErr;
    }

    const { postUrl } = await postToLinkedIn(accessToken, postText);
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

  const messageText = ctx.callbackQuery?.message?.text ?? '';
  const postText    = extractPostText(messageText);

  if (!postText) {
    return ctx.reply('⚠️ Could not read the post text to revise. Please try again.');
  }

  await ctx.reply(
    `✏️ ${REVISION_MARKER}${postText}`,
    Markup.forceReply()
  );
}

module.exports = { handlePostAction, handleRevisePick };
