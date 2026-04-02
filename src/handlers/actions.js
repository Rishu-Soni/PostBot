'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken, buildAuthUrl } = require('../services/linkedin');
const { MODIFY_MARKER, extractPostText } = require('./voice');

const LINKEDIN_ENABLED = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'].every(k => process.env[k]);

/**
 * Handles [✅ Post this].
 * Extracts the post text directly from the callback message — no DB read for content.
 */
async function handleActionPost(ctx) {
  await ctx.answerCbQuery('⏳ Working on it…');

  const postText = extractPostText(ctx.callbackQuery.message.text);
  if (!postText) {
    return ctx.reply('⚠️ Could not read the post text. Please try generating again.');
  }

  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });
  if (!user) return ctx.reply('⚠️ Account not found. Send /start to set up.');

  const thinkingMsg = await ctx.reply('⏳ Posting to LinkedIn, please wait…');
  await executeLinkedInPublish(ctx, user, postText, [], thinkingMsg);
}

/**
 * Handles [✏️ Modify this].
 * Embeds the original post text in a ForceReply message after MODIFY_MARKER.
 * When the user replies (text or voice), the original post text is re-extracted
 * from the quoted message — zero DB state required.
 */
async function handleActionModify(ctx) {
  await ctx.answerCbQuery();

  const postText = extractPostText(ctx.callbackQuery.message.text);
  if (!postText) {
    return ctx.reply('⚠️ Could not read the post text. Please try generating again.');
  }

  await ctx.reply(
    `${MODIFY_MARKER}${postText}`,
    Markup.forceReply()
  );
}

/**
 * Handles [📸 Attach Media & Post].
 * This is the ONLY action that writes content to the DB:
 *   - pendingPostText  → the specific post the user wants to publish with media
 *   - inputState       → 'awaiting_media_upload'
 * This is a deliberate minimal exception to the stateless architecture — without
 * storing the selected post text here, there is no way to re-associate it with
 * the media files that arrive as separate Telegram messages.
 */
async function handleActionAttachMedia(ctx) {
  await ctx.answerCbQuery();

  const postText = extractPostText(ctx.callbackQuery.message.text);
  if (!postText) {
    return ctx.reply('⚠️ Could not read the post text. Please try generating again.');
  }

  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });
  if (!user) return ctx.reply('⚠️ Account not found. Send /start to set up.');

  user.inputState        = 'awaiting_media_upload';
  user.pendingPostText   = postText;
  user.pendingMediaIds   = [];
  user.mediaDoneMessageId = null;
  await user.save();

  await ctx.reply(
    '📸 *Upload your photos or videos now.*\n\nSend all your media files, then click *Done and Post* when ready.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('✅ Done and Post', 'media_done_post')]]),
    }
  );
}

/**
 * Handles [✅ Done and Post] — fired after the user has uploaded all their media.
 * Reads pendingPostText + pendingMediaIds from DB and publishes to LinkedIn.
 */
async function handleMediaDonePost(ctx) {
  await ctx.answerCbQuery();

  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  if (!user || user.inputState !== 'awaiting_media_upload' || !user.pendingPostText) {
    return ctx.reply(
      '⚠️ Session expired or invalid.\n\nPlease generate a new post and click *📸 Attach Media & Post* again.',
      { parse_mode: 'Markdown' }
    );
  }

  if (user.mediaDoneMessageId) {
    await ctx.telegram.deleteMessage(ctx.chat.id, user.mediaDoneMessageId).catch(() => {});
  }

  const thinkingMsg = await ctx.reply('⏳ Posting to LinkedIn with your media, please wait…');
  await executeLinkedInPublish(ctx, user, user.pendingPostText, user.pendingMediaIds, thinkingMsg);
}

// ── Shared LinkedIn publish logic ──────────────────────────────────────────────

async function executeLinkedInPublish(ctx, user, postText, mediaIds, thinkingMsg) {
  try {
    let accessToken;
    try {
      accessToken = await getValidAccessToken(user);
    } catch (tokenErr) {
      if (tokenErr.message === 'NOT_CONNECTED' || tokenErr.message === 'TOKEN_EXPIRED') {
        await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
        if (!LINKEDIN_ENABLED) {
          return ctx.reply('⚠️ LinkedIn integration is not configured on this server.');
        }
        const prompt = tokenErr.message === 'TOKEN_EXPIRED'
          ? '🔒 *LinkedIn session expired.*\n\nRe-authorise to continue posting:'
          : '🔗 *LinkedIn not connected yet!*\n\nLink your account to start posting:';
        return ctx.reply(
          `${prompt}\n\n[👉 Connect LinkedIn](${buildAuthUrl(String(ctx.from.id))})\n\n` +
          `_Once connected, click *✅ Post this* on your chosen post again._`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      }
      throw tokenErr;
    }

    const { postUrl } = await postToLinkedIn(accessToken, postText, ctx, mediaIds);

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

    // Clear the media-upload session state after a successful post.
    user.pendingPostText   = null;
    user.pendingMediaIds   = [];
    user.inputState        = 'idle';
    user.mediaDoneMessageId = null;
    await user.save();

    await ctx.reply(
      `🎉 *Your post is live on LinkedIn!*\n\n[View your post →](${postUrl})\n\n_Ready for your next idea? Send another voice note!_`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('[actions] publish error:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(
      '😔 Failed to post to LinkedIn.\n\n' +
      (err.message.startsWith('[LinkedIn]') ? err.message : 'An unexpected error occurred.') +
      '\n\nPlease try again, or send /connect to re-link your account.'
    );
  }
}

module.exports = {
  handleActionPost,
  handleActionModify,
  handleActionAttachMedia,
  handleMediaDonePost,
};
