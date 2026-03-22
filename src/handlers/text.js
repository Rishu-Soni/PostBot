'use strict';

const { Markup }  = require('telegraf');
const { revisePosts } = require('../services/gemini');

async function handleText(ctx) {
  const text = ctx.message?.text?.trim() ?? '';
  if (!text || text.startsWith('/')) return;

  const replyText = ctx.message.reply_to_message?.text;
  
  if (replyText && replyText.includes('Reply to this message with your instructions to modify this post:\n\n---')) {
    const parts = replyText.split('\n---\n');
    if (parts.length > 1) {
      const postText = parts.slice(1).join('\n---\n').trim();
      return handleRevise(ctx, postText, text);
    }
  }

  // Not a reply to a revision prompt
  await ctx.reply(
    '🎙 I process voice notes! Send me a *voice note* with your thoughts and I\'ll turn them into 3 LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

async function handleRevise(ctx, postText, instructions) {
  // Sanitise instructions
  const sanitised = instructions.slice(0, 500).replace(/[`\\"]/g, "'");

  const thinkingMsg = await ctx.reply('✍️ Revising with Gemini… give me a moment.');

  try {
    const newStrings = await revisePosts(postText, sanitised);

    await ctx.telegram.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});
    await ctx.reply('✨ *Here are your 3 revised LinkedIn posts:*', { parse_mode: 'Markdown' });

    for (let i = 0; i < newStrings.length; i++) {
      await ctx.reply(
        `────── Option ${i + 1} ──────\n\n${newStrings[i]}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Post This Option', 'post_action')],
          [Markup.button.callback('🔄 Modify This Option', 'revise_action')],
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
