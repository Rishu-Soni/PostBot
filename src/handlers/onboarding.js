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

// Builds a 2-column inline keyboard from an options array.
// Optionally appends a [🔙 Back] button row if backPrefix is given.
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

// Edits the current message if inside a callback, otherwise sends a fresh reply.
// Silently swallows "message is not modified" errors.
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
      // Fallback for callback contexts where editing fails for other reasons
      await ctx.reply(text, extra);
    }
  }
}

/**
 * Prompts the user to send a voice note.
 * Called after onboarding or when the user is ready to generate.
 */
async function promptGenerate(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  await ctx.reply(
    '🎙 *Ready!* Send me a voice note and I\'ll turn it into polished LinkedIn posts.',
    { parse_mode: 'Markdown' }
  );
}

/**
 * /generate command handler.
 *
 * Logic:
 *  - New user (!onboardingComplete): no preferences set yet.
 *    → Offer "Continue with defaults" or "Set up preferences".
 *  - Returning user (onboardingComplete === true): has existing preferences.
 *    → Offer "Continue with previous data" or "Set up new preferences".
 *  - If user doesn't exist in DB at all, create them and treat as new.
 */
async function handleGenerateFlow(ctx) {
  const telegramId = String(ctx.from.id);
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    // Upsert: create account if this is the very first time they call /generate
    let user = await User.findOneAndUpdate(
      { telegramId },
      { $setOnInsert: { telegramId, firstName } },
      { upsert: true, new: true }
    );

    if (!user.onboardingComplete) {
      // ── New user: no saved preferences yet ────────────────────────────────
      await ctx.reply(
        `👋 Hi *${firstName}!* It looks like you haven't configured your post style yet.\n\n` +
        `You can jump straight in with the *default settings*, or take a minute to *set up your own style* for more personalised posts.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Use Default Settings', 'gen_use_default')],
            [Markup.button.callback('🛠 Set Up My Style',     'gen_new'         )],
          ]),
        }
      );
    } else {
      // ── Returning user: previously configured preferences exist ───────────
      await ctx.reply(
        `Welcome back, *${firstName}!* 🎙\n\n` +
        `Would you like to generate a post with your *previously saved preferences*, or would you prefer to *set up new ones*?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Use Previous Preferences', 'gen_saved')],
            [Markup.button.callback('🔄 Set Up New Preferences',   'gen_new'  )],
          ]),
        }
      );
    }
  } catch (err) {
    console.error('[onboarding] handleGenerateFlow:', err);
    await ctx.reply('😔 Something went wrong checking your preferences. Please try again.');
  }
}

/**
 * Handles [Use Default Settings] in /generate for new users.
 * Marks them as no longer new (they're using the defaults now), then prompts for a voice note.
 */
async function handleUseDefault(ctx) {
  await ctx.answerCbQuery();
  const telegramId = String(ctx.from.id);
  try {
    await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          onboardingComplete: true,
          // Apply default values explicitly in case they differ from schema defaults
          preferredStyles: ['Conversational', 'Storytelling', 'Punchy & Direct'],
          preferredLayout: 'Short Para',
          preferredTone:   'Casual',
        },
      }
    );
    await ctx.editMessageText(
      '✅ *Default settings applied!*\n\n' +
      '• Layout: Short Para\n• Style: Conversational, Storytelling, Punchy & Direct\n• Tone: Casual',
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    await promptGenerate(ctx);
  } catch (err) {
    console.error('[onboarding] handleUseDefault:', err);
    await ctx.reply('😔 Something went wrong. Please try again.');
  }
}

/**
 * Master entry point for /start and /setstyle.
 * Resets onboarding state and presents the Manual vs Analyze choice.
 */
async function startSetupPrompt(ctx) {
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');
  const telegramId = String(ctx.from.id);

  await User.findOneAndUpdate(
    { telegramId },
    { $set: { inputState: 'idle' } },
    { upsert: true }
  );

  await ctx.reply(
    `⚙️ *Let's set your post preferences, ${firstName}!*\n\n` +
    `Would you like to manually choose your style, or should I analyse a past LinkedIn post to learn your style automatically?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛠 Manual Setup',    'ob_flow:manual' )],
        [Markup.button.callback('🔍 Analyze Example', 'ob_flow:analyze')],
      ]),
    }
  );
}

/**
 * /start handler.
 *
 * - First visit  → user doc doesn't exist yet          → show intro + send to handleGenerateFlow
 * - Return visit → onboardingComplete may be true/false → greet + suggest /generate or /help
 */
async function handleStart(ctx) {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);
  const firstName  = (ctx.from.first_name || 'there').replace(/[_*[\]`]/g, '');

  try {
    // Check whether this user already has a document in the DB
    let user = await User.findOne({ telegramId });
    const isFirstEver = !user;

    if (isFirstEver) {
      // Brand new user — create their document
      user = await User.create({ telegramId, firstName });
    }

    const introText =
      `What I can do:\n` +
      `✨ The Postbot Flow: Complete a quick one-time setup > speak your mind into a voice note > re-generate with some modifications only if you want > and publish directly to LinkedIn.\n\n` +
      `🎛️ Commands:\n` +
      `/start - Kick off smart onboarding to extract your unique writing style.\n` +
      `/generate - Record a voice note and let me generate your next post.\n` +
      `/setstyle - Manually customize your preferred layouts, tone, and formatting.\n` +
      `/connect - Securely link your LinkedIn account for instant publishing.\n` +
      `/settings - View your current configuration and brand guidelines.\n` +
      `/deldata - 🔒 SECURITY: Run this command to permanently clear all your data from the database. This deletes your preferred styles, layout, tone, LinkedIn credentials, and all generation history, keeping only your Telegram ID and Name.\n` +
      `/help - Display this quick guide to all available commands.`;

    await ctx.reply(introText);

    if (isFirstEver) {
      // First ever visit — walk them straight into the generate flow
      return handleGenerateFlow(ctx);
    } else {
      await ctx.reply('Would you like to view /help or start a new post with /generate?');
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

// Handles [Manual Setup] or [Analyze Example] choice
async function handleFlowPick(ctx) {
  await ctx.answerCbQuery();
  const flow       = ctx.match[1];
  const telegramId = String(ctx.from.id);

  if (flow === 'manual') {
    await startLayoutStep(ctx);
  } else if (flow === 'analyze') {
    await User.findOneAndUpdate({ telegramId }, { $set: { inputState: 'awaiting_example' } });
    await safeEdit(ctx,
      `🔍 *Analyze Example*\n\nPlease paste an example of a LinkedIn post you've written recently, and I will extract your preferred Tone and Style.\n\n_(Send the plain text message now, or send /start to cancel.)_`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ── Manual Setup Steps ────────────────────────────────────────────────────────

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

// [🔙 Back] handler — steps back one question without data loss
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
      {
        $set: {
          preferredTone:      tone,
          onboardingComplete: true,
          inputState:         'idle',
        },
      },
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
    await ctx.reply('😔 Database error. Please try /setstyle again.');
  }
}

module.exports = {
  handleStart,
  handleChangePrefs,
  handleFlowPick,
  handleLayoutPick,
  handleStylePick,
  handleTonePick,
  handleBack,
  handleUseDefault,
  promptGenerate,
  startSetupPrompt,
  handleGenerateFlow,
};
