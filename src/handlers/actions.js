'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken, buildAuthUrl } = require('../services/linkedin');
const { processGeneration, sendCarouselPost } = require('./voice');

const LINKEDIN_ENABLED = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'].every(k => process.env[k]);
const REVISION_MARKER = 'Reply to this message with your instructions to modify this post:\n\n---\n';

/**
 * Handles the inline buttons [📸 Add Media] and [⏩ No Media, Continue].
 * Saves the user's choice to DB so every subsequent carousel render stays consistent,
 * then immediately kicks off Gemini generation.
 *
 * Both paths generate posts right away — if the user chose 'media',
 * they will be prompted to upload AFTER they select a specific post.
 */
async function handleMediaChoice(ctx) {
  await ctx.answerCbQuery();
  const choice     = ctx.match[1]; // 'media' | 'nomedia'
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || !user.pendingVoiceFileId) {
    return ctx.reply('⚠️ Could not find your pending voice note. Please send it again.');
  }

  // Persist the choice so all carousel renders (including post-revision) stay in sync
  user.pendingMediaChoice = choice;
  await user.save();

  // Go straight to generation regardless of media choice.
  // If 'media', the upload prompt will appear after the user selects a specific post.
  await ctx.editMessageText('✅ Got it. Generating your posts…').catch(() => {});
  await processGeneration(ctx, user);
}

/**
 * Handles [✅ Done — Generate Posts] after user has uploaded media.
 * Triggers Gemini generation with whatever media has been collected so far.
 */
async function handleMediaUploadsDone(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || !user.pendingVoiceFileId) {
    return ctx.reply('⚠️ Session expired. Please send your voice note again.');
  }

  await ctx.editMessageText(
    `✅ Got it! ${user.pendingMediaIds.length} media file(s) attached. Generating your posts…`
  ).catch(() => {});

  await processGeneration(ctx, user);
}

/**
 * Handles Carousel [✅ Choose This] — the "media" variant of the post button.
 * User has selected which post they want, now we ask them to upload media.
 */
async function handleCarouselChooseMedia(ctx) {
  await ctx.answerCbQuery();
  const index      = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || !user.currentPosts[index]) {
    return ctx.reply('⚠️ Could not find the post. Please try generating again.');
  }

  // Lock in the selected post and open the media upload window
  user.inputState         = 'awaiting_media_upload';
  user.selectedPostIndex  = index;
  user.pendingMediaIds    = [];
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
 * Handles Carousel [⬅️ Prev] and [Next ➡️] navigation.
 * Reads pendingMediaChoice from DB to keep button variant consistent.
 */
async function handleCarouselNav(ctx) {
  const index      = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || index < 0 || index >= user.currentPosts.length) {
    return ctx.answerCbQuery('⚠️ Could not load post. Try generating a new one.', { show_alert: true });
  }

  await ctx.answerCbQuery();
  // Use the persisted media choice so the correct button variant is always rendered
  await sendCarouselPost(ctx, user.currentPosts, index, user.pendingMediaChoice);
}

/**
 * Handles Carousel [✏️ Modify This].
 * Resets inputState to 'idle' so any stale 'awaiting_media_upload' state is cleared —
 * the user's media choice (pendingMediaChoice) is preserved so modified posts
 * still show the correct action button.
 */
async function handleCarouselMod(ctx) {
  await ctx.answerCbQuery();
  const index      = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || !user.currentPosts[index]) {
    return ctx.reply('⚠️ Could not find the post to revise. Please generate a new one.');
  }

  // Clear media-upload limbo — pendingMediaChoice stays intact
  if (user.inputState === 'awaiting_media_upload') {
    user.inputState        = 'idle';
    user.selectedPostIndex = null;
    user.mediaDoneMessageId = null;
    await user.save();
  }

  const postText = user.currentPosts[index];
  await ctx.reply(
    `✏️ ${REVISION_MARKER}${postText}`,
    Markup.forceReply()
  );
}

/**
 * Handles Carousel [✅ Post to LinkedIn] — the no-media path.
 */
async function handlePostAction(ctx) {
  const index      = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || !user.currentPosts[index]) {
    return ctx.answerCbQuery('⚠️ Could not read the post text. Please try again.', { show_alert: true });
  }

  const postText = user.currentPosts[index];
  await ctx.answerCbQuery('⏳ Working on it…');
  const thinkingMsg = await ctx.reply('⏳ Posting to LinkedIn, please wait…');

  await executeLinkedInPublish(ctx, user, postText, thinkingMsg);
}

/**
 * Handles [✅ Done and Post] after user has uploaded media to an awaiting_media_upload session.
 */
async function handleMediaDonePost(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const user       = await User.findOne({ telegramId });

  if (!user || user.inputState !== 'awaiting_media_upload' || user.selectedPostIndex === null) {
    return ctx.reply('⚠️ Session expired or invalid. Please generate a new post.');
  }

  const index    = user.selectedPostIndex;
  const postText = user.currentPosts[index];

  if (!postText) {
    return ctx.reply('⚠️ Could not read the post text. Please try again.');
  }

  if (user.mediaDoneMessageId) {
    await ctx.telegram.deleteMessage(ctx.chat.id, user.mediaDoneMessageId).catch(() => {});
  }

  const thinkingMsg = await ctx.reply('⏳ Posting to LinkedIn with your media, please wait…');
  await executeLinkedInPublish(ctx, user, postText, thinkingMsg);
}

// ── Shared LinkedIn publish logic ─────────────────────────────────────────────

async function executeLinkedInPublish(ctx, user, postText, thinkingMsg) {
  try {
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
        await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
        return ctx.reply(
          `${prompt}\n\n[👉 Connect LinkedIn](${buildAuthUrl(String(ctx.from.id))})`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      }
      throw tokenErr;
    }

    const { postUrl } = await postToLinkedIn(accessToken, postText, ctx, user.pendingMediaIds || []);

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

    // Clear all session state after a successful post
    user.pendingMediaIds    = [];
    user.currentPosts       = [];
    user.inputState         = 'idle';
    user.selectedPostIndex  = null;
    user.mediaDoneMessageId = null;
    user.pendingMediaChoice = 'nomedia';
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
  handlePostAction,
  handleMediaChoice,
  handleMediaDonePost,
  handleCarouselChooseMedia,
  handleCarouselNav,
  handleCarouselMod,
};
