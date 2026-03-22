'use strict';

const { Markup } = require('telegraf');
const User  = require('../models/User');

const STYLE_OPTIONS  = [
  { label: '⚡ Punchy & Direct', value: 'Punchy & Direct' },
  { label: '📖 Storytelling',    value: 'Storytelling'    },
  { label: '🔬 Analytical',      value: 'Analytical'      },
  { label: '😄 Conversational',  value: 'Conversational'  },
];
const LAYOUT_OPTIONS = [
  { label: '📄 Single block',     value: 'Single block'     },
  { label: '🔢 Numbered list',    value: 'Numbered list'    },
  { label: '• Bullet points',     value: 'Bullet points'    },
  { label: '📝 Short paragraphs', value: 'Short paragraphs' },
];
const TONE_OPTIONS   = [
  { label: '💼 Professional', value: 'Professional' },
  { label: '😊 Casual',       value: 'Casual'       },
  { label: '🔥 Motivational', value: 'Motivational' },
  { label: '😂 Humorous',     value: 'Humorous'     },
];
const STYLE_MAP = {
  'Punchy & Direct': ['Punchy & Direct', 'Storytelling',  'Analytical'     ],
  'Storytelling':    ['Storytelling',    'Punchy & Direct','Analytical'     ],
  'Analytical':      ['Analytical',      'Storytelling',   'Punchy & Direct'],
  'Conversational':  ['Conversational',  'Storytelling',   'Punchy & Direct'],
};

function buildKeyboard(options, prefix) {
  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(options.slice(i, i + 2).map(o => Markup.button.callback(o.label, `${prefix}:${o.value}`)));
  }
  return Markup.inlineKeyboard(rows);
}

async function safeEdit(ctx, text, extra) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    if (!err.message?.includes('message is not modified')) throw err;
  }
}

async function handleStart(ctx) {
  const telegramId = String(ctx.from.id);
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    const raw = await User.findOneAndUpdate(
      { telegramId },
      { $setOnInsert: { telegramId, firstName } },
      { upsert: true, new: false, rawResult: true }
    );
    const isNew = !!raw?.lastErrorObject?.upserted;

    const user = await User.findOne({ telegramId });

    if (!isNew && user?.onboardingComplete) {
      await ctx.reply(
        `👋 Welcome back, *${firstName}!*\n\n` +
        `🎙 Send me a *voice note* and I'll turn it into 3 polished LinkedIn posts.\n\n` +
        `_To update your preferences, use /settings._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await ctx.reply(
      isNew
        ? `👋 Welcome to *Postbot*, ${firstName}!\n\nI turn your voice note brain-dumps into 3 polished LinkedIn posts in seconds.\n\n*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?`
        : `👋 Welcome back, ${firstName}!\n\nLet's finish setting up your preferences.\n\n*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?`,
      { parse_mode: 'Markdown', ...buildKeyboard(STYLE_OPTIONS, 'ob_style') }
    );
  } catch (err) {
    console.error('[onboarding] handleStart:', err);
    await ctx.reply('😔 Something went wrong. Please try /start again.');
  }
}

async function handleChangePrefs(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  
  await User.findOneAndUpdate({ telegramId }, { $set: { onboardingComplete: false } });
  
  await safeEdit(ctx,
    `⚙️ *Let's update your preferences!*\n\n*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?`,
    { parse_mode: 'Markdown', ...buildKeyboard(STYLE_OPTIONS, 'ob_style') }
  );
}

async function handleStylePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const chosenStyle = ctx.match[1];
  const styles = STYLE_MAP[chosenStyle] ?? ['Punchy & Direct', 'Storytelling', 'Analytical'];
  
  await User.findOneAndUpdate({ telegramId }, { $set: { preferredStyles: styles } });
  
  await safeEdit(ctx,
    `✅ *Writing style:* ${chosenStyle}\n\n*Step 2 of 3 — Post Layout*\nHow should your posts be formatted?`,
    { parse_mode: 'Markdown', ...buildKeyboard(LAYOUT_OPTIONS, 'ob_layout') }
  );
}

async function handleLayoutPick(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const chosenLayout = ctx.match[1];
  
  await User.findOneAndUpdate({ telegramId }, { $set: { preferredLayout: chosenLayout } });
  
  await safeEdit(ctx,
    `✅ *Layout:* ${chosenLayout}\n\n*Step 3 of 3 — Tone*\nWhat tone should your posts have?`,
    { parse_mode: 'Markdown', ...buildKeyboard(TONE_OPTIONS, 'ob_tone') }
  );
}

async function handleTonePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const tone = ctx.match[1];
  const firstName = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: { preferredTone: tone, onboardingComplete: true } },
      { new: true }
    );
    
    await safeEdit(ctx,
      `✅ *Tone:* ${tone}\n\n🎉 *All set, ${firstName}!*\n\n` +
      `Your preferences:\n• Style: ${user.preferredStyles.join(', ')}\n• Layout: ${user.preferredLayout}\n• Tone: ${tone}\n\n` +
      `🎙 *Now send me a voice note* with your raw thoughts or ideas.\n\n_Use /settings any time to review or change your preferences._`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[onboarding] handleTonePick:', err);
    await ctx.reply('😔 Could not save your preferences. Please try /start again.');
  }
}

module.exports = { handleStart, handleChangePrefs, handleStylePick, handleLayoutPick, handleTonePick };
