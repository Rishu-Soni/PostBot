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
 * Presents the two style-setup paths:
 *   [Manual Setup]       → user types their vibe; Gemini generates a dummy post and pins it.
 *   [Provide Example Post] → user pastes a real post; bot pins it directly.
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
    `⚙️ *Let's define your style template, ${firstName}!*\n\n` +
    `Choose how you want to set it up:\n\n` +
    `• *Manual Setup* — Describe your preferred vibe, tone, and layout in text. I'll generate a dummy post that perfectly captures it and pin it as your template.\n\n` +
    `• *Provide Example Post* — Paste a real LinkedIn post you love. I'll pin it directly as your style blueprint.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛠 Manual Setup',          'ob_flow:manual' )],
        [Markup.button.callback('📋 Provide Example Post', 'ob_flow:example')],
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
      `/setstyle - Set your master template by providing an example post or describing your vibe.\n` +
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

/**
 * Handles [Manual Setup] or [Provide Example Post] inline button presses.
 *
 * ob_flow:manual   → user will type their vibe in text; Gemini generates a dummy post → pinned.
 * ob_flow:example  → user will paste an existing LinkedIn post → pinned directly.
 */
async function handleFlowPick(ctx) {
  await ctx.answerCbQuery();
  const flow       = ctx.match[1];
  const telegramId = String(ctx.from.id);

  if (flow === 'manual') {
    await User.findOneAndUpdate({ telegramId }, { $set: { inputState: 'awaiting_describe_vibe' } });
    await safeEdit(ctx,
      `🛠 *Manual Setup*\n\n` +
      `Describe your preferred posting style in detail — mention your tone, layout, emoji usage, paragraph structure, and anything else that defines your vibe.\n\n` +
      `_Example: "Professional but warm tone, lots of white space, short punchy sentences, 3 bullet points, minimal emojis, always end with a question."_\n\n` +
      `I'll generate a dummy template post that perfectly captures your style and pin it to the top of this chat.\n\n` +
      `_(Type your description and send it, or use /setstyle to go back.)_`,
      { parse_mode: 'Markdown' }
    );
  } else if (flow === 'example') {
    await User.findOneAndUpdate({ telegramId }, { $set: { inputState: 'awaiting_upload_example' } });
    await safeEdit(ctx,
      `📋 *Provide Example Post*\n\n` +
      `Paste a real LinkedIn post that represents your ideal writing style. I'll pin it directly to this chat and use it as the blueprint for all your future posts.\n\n` +
      `💡 *Pro Tip:* This works best with a post that has the exact layout, tone, and emoji style you want to replicate.\n\n` +
      `_(Send the post text now, or use /setstyle to go back.)_`,
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
