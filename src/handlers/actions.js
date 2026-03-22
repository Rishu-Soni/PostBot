'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken } = require('../services/linkedin');

// Helper to extract raw post text from the message body
function extractPostText(messageText) {
  if (!messageText) return '';
  const headerMatch = messageText.match(/^────── Option \d+ ──────\s+/);
  return headerMatch ? messageText.replace(headerMatch[0], '') : messageText;
}

async function handlePostAction(ctx) {
  const telegramId = String(ctx.from.id);
  const messageText = ctx.callbackQuery.message.text;
  
  const postText = extractPostText(messageText);
  if (!postText) {
    return ctx.answerCbQuery('⚠️ Could not extract the post text. Please try again.', { show_alert: true });
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
  
  const postText = extractPostText(ctx.callbackQuery.message.text);
  if (!postText) {
    return ctx.reply('⚠️ Could not extract the post text to revise. Please try again.');
  }

  await ctx.reply(
    `✏️ Reply to this message with your instructions to modify this post:\n\n---\n${postText}`,
    Markup.forceReply()
  );
}

module.exports = { handlePostAction, handleRevisePick, extractPostText };
