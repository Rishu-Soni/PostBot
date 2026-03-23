'use strict';

const { Markup } = require('telegraf');
const User  = require('../models/User');

const STYLE_OPTIONS = [
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
const TONE_OPTIONS = [
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

/**
 * Prompt the user to send a voice note.
 * First checks if the user has preferredStyles set in the DB.
 * If not, auto-triggers style setup instead.
 */
async function promptGenerate(ctx) {
  const telegramId = String(ctx.from.id);

  try {
    const user = await User.findOne({ telegramId });
    // If styles are not set, run setStyle first, which will auto-call promptGenerate on completion
    if (!user || !user.preferredStyles?.length || !user.onboardingComplete) {
      await ctx.reply(
        '⚙️ *Let\'s set your preferred post style first!*\n\nOnce done, I\'ll prompt you for a voice note automatically.',
        { parse_mode: 'Markdown' }
      );
      return startStyleSetup(ctx);
    }
  } catch (err) {
    console.error('[onboarding] promptGenerate DB check:', err);
    return ctx.reply('😔 Something went wrong checking your preferences. Please try again.');
  }

  await ctx.reply(
    '🎙 *Ready!* Send me a voice note and I\'ll turn it into 3 polished LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

/**
 * Kick off the 3-step style setup.
 * Used by /start (new users), /setStyle, and as a fallback from /generate.
 */
async function startStyleSetup(ctx) {
  const firstName = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');
  await User.findOneAndUpdate(
    { telegramId: String(ctx.from.id) },
    { $set: { onboardingComplete: false } }
  );
  await ctx.reply(
    `⚙️ *Let's set your post preferences, ${firstName}!*\n\n*Step 1 of 3 — Writing Style*\nHow would you like your posts to be written?`,
    { parse_mode: 'Markdown', ...buildKeyboard(STYLE_OPTIONS, 'ob_style') }
  );
}

/**
 * /start handler.
 * New user → run style setup.
 * Returning user with complete onboarding → welcome back.
 */
async function handleStart(ctx) {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    // Upsert: create if new, return the latest doc
    const user = await User.findOneAndUpdate(
      { telegramId },
      { $setOnInsert: { telegramId, firstName } },
      { upsert: true, new: true }
    );

    if (user.onboardingComplete) {
      // Returning user with complete prefs — skip setup, go straight to prompting
      await ctx.reply(
        `👋 Welcome back, *${firstName}!*\n\n` +
        `🎙 Send me a *voice note* and I'll turn it into 3 polished LinkedIn posts.\n\n` +
        `_Use /settings to review your preferences or /generate to start._`,
        { parse_mode: 'Markdown' }
      );
    } else {
      // New user or incomplete setup
      await ctx.reply(
        `👋 Welcome to *Postbot*, ${firstName}!\n\nI turn your voice notes into 3 polished LinkedIn posts in seconds.\n\nLet's set up your preferences first.`,
        { parse_mode: 'Markdown' }
      );
      await startStyleSetup(ctx);
    }
  } catch (err) {
    console.error('[onboarding] handleStart:', err);
    await ctx.reply('😔 Something went wrong. Please try /start again.');
  }
}

async function handleChangePrefs(ctx) {
  await ctx.answerCbQuery();
  try {
    await startStyleSetup(ctx);
  } catch (err) {
    console.error('[onboarding] handleChangePrefs:', err);
    await ctx.answerCbQuery('😔 Something went wrong. Please try again.', { show_alert: true });
  }
}

async function handleStylePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId  = String(ctx.from.id);
  const chosenStyle = ctx.match[1];
  const styles      = STYLE_MAP[chosenStyle] ?? ['Punchy & Direct', 'Storytelling', 'Analytical'];

  try {
    await User.findOneAndUpdate({ telegramId }, { $set: { preferredStyles: styles } });
    await safeEdit(ctx,
      `✅ *Writing style:* ${chosenStyle}\n\n*Step 2 of 3 — Post Layout*\nHow should your posts be formatted?`,
      { parse_mode: 'Markdown', ...buildKeyboard(LAYOUT_OPTIONS, 'ob_layout') }
    );
  } catch (err) {
    console.error('[onboarding] handleStylePick:', err);
    await ctx.reply('😔 Could not save your style. Please try again.');
  }
}

async function handleLayoutPick(ctx) {
  await ctx.answerCbQuery();
  const telegramId   = String(ctx.from.id);
  const chosenLayout = ctx.match[1];

  try {
    await User.findOneAndUpdate({ telegramId }, { $set: { preferredLayout: chosenLayout } });
    await safeEdit(ctx,
      `✅ *Layout:* ${chosenLayout}\n\n*Step 3 of 3 — Tone*\nWhat tone should your posts have?`,
      { parse_mode: 'Markdown', ...buildKeyboard(TONE_OPTIONS, 'ob_tone') }
    );
  } catch (err) {
    console.error('[onboarding] handleLayoutPick:', err);
    await ctx.reply('😔 Could not save your layout. Please try again.');
  }
}

async function handleTonePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const tone       = ctx.match[1];
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  let user;
  try {
    user = await User.findOneAndUpdate(
      { telegramId },
      { $set: { preferredTone: tone, onboardingComplete: true } },
      { new: true }
    );
  } catch (err) {
    // DB error — show error, do NOT auto-trigger generate
    console.error('[onboarding] handleTonePick DB save failed:', err);
    await ctx.reply('😔 Could not save your preferences due to a database error. Please try /setStyle again.');
    return;
  }

  // Guard: user should always exist here (created in /start upsert), but be safe
  if (!user) {
    await ctx.reply('⚠️ Your account was not found. Please send /start to re-register.');
    return;
  }

  await safeEdit(ctx,
    `✅ *Tone:* ${tone}\n\n🎉 *All set, ${firstName}!*\n\n` +
    `Your preferences:\n• Style: ${user.preferredStyles.join(', ')}\n• Layout: ${user.preferredLayout}\n• Tone: ${tone}\n`,
    { parse_mode: 'Markdown' }
  );

  // Auto-trigger generate prompt — only reached if DB save above succeeded
  await promptGenerate(ctx);
}

module.exports = { handleStart, handleChangePrefs, handleStylePick, handleLayoutPick, handleTonePick, startStyleSetup, promptGenerate };
