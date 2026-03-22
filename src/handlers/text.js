'use strict';

const { Markup }  = require('telegraf');
const { revisePosts } = require('../services/gemini');

const REVISION_MARKER = 'Reply to this message with your instructions to modify this post:\n\n---\n';

// Safely extract the original post text from a force-reply message.
// Uses indexOf instead of split so post bodies containing '\n---\n' never corrupt extraction.
function extractFromReply(replyText) {
  const idx = replyText.indexOf(REVISION_MARKER);
  if (idx === -1) return null;
  return replyText.slice(idx + REVISION_MARKER.length).trim();
}

async function handleText(ctx) {
  const text = ctx.message?.text?.trim() ?? '';
  if (!text || text.startsWith('/')) return;

  const postText = ctx.message.reply_to_message?.text
    ? extractFromReply(ctx.message.reply_to_message.text)
    : null;

  if (postText) return handleRevise(ctx, postText, text);

  await ctx.reply(
    '🎙 I process voice notes! Send me a *voice note* with your thoughts and I\'ll turn them into 3 LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

async function handleRevise(ctx, postText, instructions) {
  const sanitised  = instructions.slice(0, 500).replace(/[`\\"]/g, "'");
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
