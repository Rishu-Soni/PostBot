'use strict';

const { Markup } = require('telegraf');
const User = require('../models/User');
const { postToLinkedIn, getValidAccessToken, buildAuthUrl } = require('../services/linkedin');
const { processGeneration, sendCarouselPost } = require('./voice');

const LINKEDIN_ENABLED = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'].every(k => process.env[k]);
const REVISION_MARKER = 'Reply to this message with your instructions to modify this post:\n\n---\n';

// Handles [Add media] (gen_choice:media) or [Continue without one] (gen_choice:nomedia)
async function handleMediaChoice(ctx) {
  await ctx.answerCbQuery();
  const choice = ctx.match[1];
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });
  if (!user || user.inputState !== 'idle' || !user.pendingVoiceFileId) return;

  await ctx.editMessageText('✅ Got it. Generating your posts...');
  await processGeneration(ctx, user, choice);
}

// Handles Carousel [✅ Choose this]
async function handleCarouselChooseMedia(ctx) {
  await ctx.answerCbQuery();
  const index = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || !user.currentPosts[index]) {
    return ctx.reply('⚠️ Could not find the post. Please try generating again.');
  }

  user.inputState = 'awaiting_media_upload';
  user.selectedPostIndex = index;
  user.pendingMediaIds = [];
  user.mediaDoneMessageId = null;
  await user.save();

  await ctx.reply('📸 Please upload your media (photos or videos).');
}

// Handles Carousel [Prev] and [Next]
async function handleCarouselNav(ctx) {
  const index = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });
  
  if (!user || !user.currentPosts || index < 0 || index >= user.currentPosts.length) {
    return ctx.answerCbQuery('⚠️ Could not load post. Try generating a new one.', { show_alert: true });
  }

  await ctx.answerCbQuery();
  await sendCarouselPost(ctx, user.currentPosts, index);
}

// Handles Carousel [Modify This]
async function handleCarouselMod(ctx) {
  await ctx.answerCbQuery();
  const index = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || !user.currentPosts[index]) {
    return ctx.reply('⚠️ Could not find the post to revise. Please generate a new one.');
  }

  const postText = user.currentPosts[index];
  await ctx.reply(
    `✏️ ${REVISION_MARKER}${postText}`,
    Markup.forceReply()
  );
}

// Handles Carousel [Post to LinkedIn] (no-media path)
async function handlePostAction(ctx) {
  const index = parseInt(ctx.match[1], 10);
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  if (!user || !user.currentPosts || !user.currentPosts[index]) {
    return ctx.answerCbQuery('⚠️ Could not read the post text. Please try again.', { show_alert: true });
  }

  const postText = user.currentPosts[index];

  await ctx.answerCbQuery('⏳ Working on it…');
  const thinkingMsg = await ctx.reply('⏳ Posting to LinkedIn, please wait...');

  await executeLinkedInPublish(ctx, user, postText, thinkingMsg);
}

// Handles [✅ Done and post] (media path)
async function handleMediaDonePost(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });
  
  if (!user || user.inputState !== 'awaiting_media_upload' || user.selectedPostIndex === null) {
    return ctx.reply('⚠️ Session expired or invalid. Please generate a new post.');
  }

  const index = user.selectedPostIndex;
  const postText = user.currentPosts[index];

  if (!postText) {
    return ctx.reply('⚠️ Could not read the post text. Please try again.');
  }

  if (user.mediaDoneMessageId) {
    await ctx.telegram.deleteMessage(ctx.chat.id, user.mediaDoneMessageId).catch(() => {});
  }

  const thinkingMsg = await ctx.reply('⏳ Posting to LinkedIn with your media, please wait...');
  await executeLinkedInPublish(ctx, user, postText, thinkingMsg);
}

// Shared publish logic
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
        await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(()=>{});
        return ctx.reply(
          `${prompt}\n\n[👉 Connect LinkedIn](${buildAuthUrl(String(ctx.from.id))})`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      }
      throw tokenErr;
    }

    const { postUrl } = await postToLinkedIn(accessToken, postText, ctx, user.pendingMediaIds || []);
    
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(()=>{});
    
    user.pendingMediaIds = [];
    user.currentPosts = [];
    user.inputState = 'idle';
    user.selectedPostIndex = null;
    user.mediaDoneMessageId = null;
    await user.save();

    await ctx.reply(
      `🎉 *Your post is live on LinkedIn!*\n\n[View your post →](${postUrl})\n\n_Ready for your next idea? Send another voice note!_`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('[actions] publish error:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(()=>{});
    await ctx.reply(
      '😔 Failed to post to LinkedIn.\n\n' +
      (err.message.startsWith('[LinkedIn]') ? err.message : 'An unexpected error occurred.') +
      '\n\nPlease try again, or send /connect to re-link your account.'
    );
  }
}

module.exports = { handlePostAction, handleMediaChoice, handleMediaDonePost, handleCarouselChooseMedia, handleCarouselNav, handleCarouselMod };
