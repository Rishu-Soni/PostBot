'use strict';

const { Markup }  = require('telegraf');
const { revisePosts } = require('../services/gemini');
const { makePostId }  = require('./voice');
const { STEPS, getSession, updateSession } = require('../state/sessionStore');

async function handleText(ctx) {
  const telegramId = String(ctx.from.id);
  const text       = ctx.message?.text?.trim() ?? '';
  if (!text || text.startsWith('/')) return;

  const session = getSession(telegramId);

  switch (session.step) {
    case STEPS.WAITING_REVISE_INPUT:
      await handleRevise(ctx, telegramId, text, session);
      break;
    case STEPS.WAITING_VOICE:
      await ctx.reply('🎙 I\'m ready! Send me a *voice note* with your thoughts and I\'ll turn them into 3 LinkedIn posts.', { parse_mode: 'Markdown' });
      break;
    case STEPS.IDLE:
      await ctx.reply('👋 Send /start to get going!');
      break;
    case STEPS.WAITING_REVISE_PICK:
      await ctx.reply('⬆️ Please use the buttons above to choose which option to revise.');
      break;
    default:
      await ctx.reply('👆 Please use the buttons above to complete setup.');
  }
}

async function handleRevise(ctx, telegramId, instructions, session) {
  const postId = session.temp?.revisePostId;
  const post   = postId ? session.posts?.find(p => p.id === postId) : null;

  if (!post) {
    await ctx.reply('⚠️ Session expired. Please send a new voice note first.');
    updateSession(telegramId, { step: STEPS.WAITING_VOICE, temp: {} });
    return;
  }

  // Sanitise: truncate and strip characters that could break the Gemini prompt
  const sanitised = instructions.slice(0, 500).replace(/[`\\"]/g, "'");

  const thinkingMsg = await ctx.reply('✍️ Revising with Gemini… give me a moment.');

  try {
    // revisePosts takes the single post text + instructions, returns 3 new variations
    const newStrings = await revisePosts(post.text, sanitised);

    // Wrap each result as a new {id, text} with fresh IDs
    const newPosts = newStrings.map((text, i) => ({ id: makePostId(telegramId, i), text }));

    updateSession(telegramId, { step: STEPS.WAITING_VOICE, posts: newPosts, temp: {} });

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply('✨ *Here are your 3 revised LinkedIn posts:*', { parse_mode: 'Markdown' });

    for (let i = 0; i < newPosts.length; i++) {
      await ctx.reply(
        `────── Option ${i + 1} ──────\n\n${newPosts[i].text}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Post This Option', `post_${newPosts[i].id}`)],
          [Markup.button.callback('🔄 Modify This Option', `revise_pick_${newPosts[i].id}`)],
        ])
      );
    }
  } catch (err) {
    console.error('[text] handleRevise:', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply(`😔 Revision failed.\n\n${err.message.startsWith('[Gemini]') ? err.message : 'Please try again or send a new voice note.'}`);
  }
}

module.exports = { handleText };
