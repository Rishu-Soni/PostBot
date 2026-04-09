'use strict';

const { Markup } = require('telegraf');
const User  = require('../models/User');

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
        },
      }
    );
    await ctx.editMessageText(
      '✅ *Default profile applied!*\n\n' +
      'I will fall back to my default Postbot style for generations.',
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
    `⚙️ *Let's define your template, ${firstName}!*\n\n` +
    `Your posts will strictly follow the layout and vibe of an example post. You can either upload a past post, or describe your desired vibe to me and I'll create a template for you.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔗 Upload Example Post', 'ob_flow:upload')],
        [Markup.button.callback('🎙️ Describe My Vibe',  'ob_flow:describe')],
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
      `/setstyle - Set your master template by uploading an example or describing your vibe.\n` +
      `/connect - Securely link your LinkedIn account for instant publishing.\n` +
      `/settings - View your current configuration and brand guidelines.\n` +
      `/deldata - 🔒 SECURITY: Run this command to permanently clear all your data from the database. This deletes your LinkedIn credentials and all generation history, keeping only your Telegram ID and Name.\n` +
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

// Handles [Upload Example Post] or [Describe My Vibe] choice
async function handleFlowPick(ctx) {
  await ctx.answerCbQuery();
  const flow       = ctx.match[1];
  const telegramId = String(ctx.from.id);

  if (flow === 'upload') {
    await User.findOneAndUpdate({ telegramId }, { $set: { inputState: 'awaiting_upload_example' } });
    await safeEdit(ctx,
      `🔗 *Upload Example Post*\n\nPlease paste an example of a LinkedIn post whose structure and vibe you want to use as your master template.\n\n_(Send the text message now, or send /start to cancel.)_`,
      { parse_mode: 'Markdown' }
    );
  } else if (flow === 'describe') {
    await User.findOneAndUpdate({ telegramId }, { $set: { inputState: 'awaiting_describe_vibe' } });
    await safeEdit(ctx,
      `🎙️ *Describe My Vibe*\n\nSend a text description or a voice note explaining how you want your posts to look and sound (e.g., "Use bullet points, sound professional, tell a story"). I'll generate a dummy post to serve as your template.\n\n_(Send your description now, or send /start to cancel.)_`,
      { parse_mode: 'Markdown' }
    );
  }
}

module.exports = {
  handleStart,
  handleChangePrefs,
  handleFlowPick,
  handleUseDefault,
  promptGenerate,
  startSetupPrompt,
  handleGenerateFlow,
};
