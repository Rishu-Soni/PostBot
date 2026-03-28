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
  { label: '📝 Short Para',     value: 'Short Para'     },
  { label: '🏆 Achievement',    value: 'Achievement'    },
  { label: '🚀 Promote',        value: 'Promote'        },
  { label: '📅 Daily Progress', value: 'Daily Progress' },
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

const LAYOUT_DESCRIPTIONS = `
*Layout Explanations:*
• *Short Para:* 2-3 lines of hook, followed by explanation, ending with a Call-to-Action or question. Concise paragraphs.
• *Achievement:* 2-3 short paragraphs explaining an achievement, followed by details (how-to, importance, context).
• *Promote:* Highlights a related question/situation, the problem faced, and the solution in short paragraphs.
• *Daily Progress:* 1-line title, 2-line summary, accomplishments, issues faced, key learnings, ending with a question.
`;

function buildKeyboard(options, prefix, backPrefix = null) {
  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(options.slice(i, i + 2).map(o => Markup.button.callback(o.label, `${prefix}:${o.value}`)));
  }
  if (backPrefix) {
    rows.push([Markup.button.callback('🔙 Back', `ob_back:${backPrefix}`)]);
  }
  return Markup.inlineKeyboard(rows);
}

async function safeEdit(ctx, text, extra) {
  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, extra);
    } else {
      await ctx.reply(text, extra);
    }
  } catch (err) {
    if (!err.message?.includes('message is not modified')) {
      if (!ctx.callbackQuery) throw err;
      // Fallback
      await ctx.reply(text, extra);
    }
  }
}

/**
 * Ensures user is onboarded, then prompts for voice.
 */
async function promptGenerate(ctx) {
  const telegramId = String(ctx.from.id);

  try {
    const user = await User.findOne({ telegramId });
    if (!user || !user.onboardingComplete) {
      await ctx.reply(
        '⚙️ *Let\'s set your preferences first!*\n\nOnce done, I\'ll prompt you automatically.',
        { parse_mode: 'Markdown' }
      );
      return startSetupPrompt(ctx);
    }
  } catch (err) {
    console.error('[onboarding] promptGenerate DB check:', err);
    return ctx.reply('😔 Something went wrong checking your preferences. Please try again.');
  }

  await ctx.reply(
    '🎙 *Ready!* Send me a voice note and I\'ll turn it into polished LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

/**
 * Master entry point for /start and /setStyle.
 */
async function startSetupPrompt(ctx) {
  const firstName = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');
  const telegramId = String(ctx.from.id);
  
  await User.findOneAndUpdate(
    { telegramId },
    { $set: { onboardingComplete: false, inputState: 'idle' } },
    { upsert: true }
  );

  await ctx.reply(
    `⚙️ *Let's set your post preferences, ${firstName}!*\n\nWould you like to manually choose your style, or should I analyze a past LinkedIn post to learn your style automatically?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛠 Manual Setup', 'ob_flow:manual')],
        [Markup.button.callback('🔍 Analyze Example', 'ob_flow:analyze')]
      ])
    }
  );
}

async function handleStart(ctx) {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    const user = await User.findOneAndUpdate(
      { telegramId },
      { $setOnInsert: { telegramId, firstName } },
      { upsert: true, new: true }
    );

    if (user.onboardingComplete) {
      await ctx.reply(
        `👋 Welcome back, *${firstName}!*\n\n` +
        `🎙 Send me a *voice note* and I'll turn it into polished LinkedIn posts.\n\n` +
        `_Use /settings to review your preferences or /generate to start._`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        `👋 Welcome to *Postbot*, ${firstName}!\n\nI turn your voice notes into viral-ready LinkedIn posts in seconds.\n\nLet's set up your preferences first.`,
        { parse_mode: 'Markdown' }
      );
      await startSetupPrompt(ctx);
    }
  } catch (err) {
    console.error('[onboarding] handleStart:', err);
    await ctx.reply('😔 Something went wrong. Please try /start again.');
  }
}

async function handleChangePrefs(ctx) {
  await ctx.answerCbQuery();
  try {
    await startSetupPrompt(ctx);
  } catch (err) {
    console.error('[onboarding] handleChangePrefs:', err);
    await ctx.answerCbQuery('😔 Something went wrong. Please try again.', { show_alert: true });
  }
}

async function handleFlowPick(ctx) {
  await ctx.answerCbQuery();
  const flow = ctx.match[1];
  const telegramId = String(ctx.from.id);
  
  if (flow === 'manual') {
    // Start Layout Setup
    await startLayoutStep(ctx);
  } else if (flow === 'analyze') {
    await User.findOneAndUpdate({ telegramId }, { $set: { inputState: 'awaiting_example' } });
    await safeEdit(ctx,
      `🔍 *Analyze Example*\n\nPlease paste an example of a LinkedIn post you've written recently, and I will extract your preferred Tone and Style.\n\n(Send the plain text message now, or click /start to cancel.)`,
      { parse_mode: 'Markdown' }
    );
  }
}

// === MANUAL FLOW STEPS ===

async function startLayoutStep(ctx) {
  await safeEdit(ctx,
    `*Step 1 of 3 — Post Layout*\nHow should your posts be structured?\n${LAYOUT_DESCRIPTIONS}`,
    { parse_mode: 'Markdown', ...buildKeyboard(LAYOUT_OPTIONS, 'ob_layout') }
  );
}

async function startStyleStep(ctx) {
  await safeEdit(ctx,
    `*Step 2 of 3 — Writing Style*\nHow would you like your posts to be written?`,
    { parse_mode: 'Markdown', ...buildKeyboard(STYLE_OPTIONS, 'ob_style', 'layout_step') }
  );
}

async function handleBack(ctx) {
  await ctx.answerCbQuery();
  const step = ctx.match[1];
  if (step === 'layout_step') {
    await startLayoutStep(ctx);
  } else if (step === 'style_step') {
    await startStyleStep(ctx);
  }
}

async function handleLayoutPick(ctx) {
  await ctx.answerCbQuery();
  const telegramId   = String(ctx.from.id);
  const chosenLayout = ctx.match[1];

  try {
    await User.findOneAndUpdate({ telegramId }, { $set: { preferredLayout: chosenLayout } });
    await startStyleStep(ctx);
  } catch (err) {
    console.error('[onboarding] handleLayoutPick:', err);
    await ctx.reply('😔 Could not save your layout. Please try again.');
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
      `*Step 3 of 3 — Tone*\nWhat tone should your posts have?`,
      { parse_mode: 'Markdown', ...buildKeyboard(TONE_OPTIONS, 'ob_tone', 'style_step') }
    );
  } catch (err) {
    console.error('[onboarding] handleStylePick:', err);
    await ctx.reply('😔 Could not save your style. Please try again.');
  }
}

async function handleTonePick(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  const tone       = ctx.match[1];
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: { preferredTone: tone, onboardingComplete: true, inputState: 'idle', pinnedExampleText: null } },
      { new: true }
    );
    if (!user) return ctx.reply('⚠️ Account not found. Send /start.');

    await safeEdit(ctx,
      `✅ *Manual Setup Complete, ${firstName}!*\n\n` +
      `Your preferences:\n• Layout: ${user.preferredLayout}\n• Style: ${user.preferredStyles.join(', ')}\n• Tone: ${tone}\n`,
      { parse_mode: 'Markdown' }
    );
    await promptGenerate(ctx);
  } catch (err) {
    console.error('[onboarding] handleTonePick:', err);
    await ctx.reply('😔 Database error. Please try /setStyle again.');
  }
}

module.exports = { 
  handleStart, handleChangePrefs, handleFlowPick, handleLayoutPick, 
  handleStylePick, handleTonePick, handleBack, promptGenerate, startSetupPrompt 
};
