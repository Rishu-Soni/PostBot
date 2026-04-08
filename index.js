'use strict';

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

// Validate required env vars at startup
for (const key of ['TELEGRAM_BOT_TOKEN', 'WEBHOOK_DOMAIN', 'WEBHOOK_SECRET_TOKEN', 'GEMINI_API_KEY', 'MONGODB_URI']) {
  if (!process.env[key]) { console.error(`[FATAL] Missing required env var: ${key}`); process.exit(1); }
}

const LINKEDIN_VARS = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'];
const LINKEDIN_ENABLED = LINKEDIN_VARS.every(k => process.env[k]);
if (!LINKEDIN_ENABLED) console.warn(`[WARN] LinkedIn env vars not set. LinkedIn features disabled.`);

const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN.replace(/\/$/, '');
const WEBHOOK_PATH = '/webhook/telegram';
const WEBHOOK_URL = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;

const { handleStart, handleChangePrefs, handleFlowPick, promptGenerate, startSetupPrompt,
  handleUseDefault, handleGenerateFlow
} = require('./src/handlers/onboarding');
const { handleVoice } = require('./src/handlers/voice');
const { handleActionPost, handleActionModify, handleActionAttachMedia, handleActionCancelMedia, handleMediaDonePost } = require('./src/handlers/actions');
const { handleText } = require('./src/handlers/text');
const { exchangeCodeForToken, buildAuthUrl } = require('./src/services/linkedin');
const User = require('./src/models/User');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();

// DB connection caching (serverless-friendly)
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  console.log('[DB] Connected to MongoDB');
}

app.use(express.json());

// ── Express Routes ─────────────────────────────────────────────────────────────

app.post(WEBHOOK_PATH, (req, res) => {
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  // 1. Immediately acknowledge Telegram to explicitly prevent webhook retry spam & duplicate APIs.
  res.status(200).send('OK');

  // 2. Safely proxy the update asynchronously in the background to avoid blocking the webhook.
  // Note: Vercel might freeze background execution if not strictly controlled; ensure container remains hot.
  (async () => {
    try {
      await connectDB();
      await bot.handleUpdate(req.body);
    } catch (err) {
      console.error('[Webhook Background Engine] Error:', err);
    }
  })();
});

app.get('/setup', async (req, res) => {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET });

    // Register the 7 bot menu commands visible to every user
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Launch Postbot setup' },
      { command: 'generate', description: 'Start generating a post' },
      { command: 'setstyle', description: 'Set preferred post style' },
      { command: 'connect', description: 'Link your LinkedIn account' },
      { command: 'settings', description: 'View & update your preferences' },
      { command: 'deldata', description: 'Delete your data completely' },
      { command: 'help', description: 'Show quick guide' },
    ]);

    res.send(`✅ Webhook set to: ${WEBHOOK_URL}\n✅ Bot commands registered.`);
  } catch (err) {
    res.status(500).send(`❌ Failed: ${err.message}`);
  }
});

app.get('/health', async (req, res) => {
  try {
    await connectDB();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

app.get('/auth/linkedin/callback', async (req, res) => {
  if (!LINKEDIN_ENABLED) return res.status(503).send('LinkedIn not configured.');

  const { code, state: telegramId, error, error_description } = req.query;

  if (error) return res.status(400).send(`<h2>❌ LinkedIn connection failed</h2><p>${error_description || error}</p><p>Return to Telegram and send <b>/connect</b> to try again.</p>`);
  if (!code || !telegramId) return res.status(400).send('<h2>❌ Bad Request</h2><p>Missing required parameters.</p>');

  try {
    await connectDB();
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);

    // Critical 5 fix: fetch BEFORE update (new: false) so we can read pendingPostText,
    // then atomically $unset it to prevent ghost-post re-appearance on future reconnects.
    const user = await User.findOneAndUpdate(
      { telegramId },
      {
        $set:   { linkedinAccessToken: accessToken, linkedinRefreshToken: refreshToken, linkedinTokenExpiry: new Date(Date.now() + expiresIn * 1000) },
        $unset: { pendingPostText: '', pendingMediaIds: '' },
      },
      { new: false }  // return PRE-update doc so pendingPostText is still readable
    );

    if (user && user.pendingPostText) {
      await bot.telegram.sendMessage(
        telegramId,
        `✅ Welcome back! Your LinkedIn account is reconnected.\n\nHere is your pending post:\n\n${user.pendingPostText}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Post this',   'action_post'),
            Markup.button.callback('✏️ Modify this', 'action_modify'),
          ],
          [Markup.button.callback('📸 Attach Media & Post', 'action_attach_media')]
        ])
      );
    } else {
      await bot.telegram.sendMessage(
        telegramId,
        'Account connected successfully! Please click \'✅ Post this\' on your preferred post above to publish it.'
      );
    }

    return res.send('<h2>✅ LinkedIn connected!</h2><p>You can close this tab and return to Telegram.</p>');
  } catch (err) {
    console.error('[LinkedIn OAuth] Token exchange failed:', err.message);
    return res.status(500).send(`<h2>❌ Connection failed</h2><p>Could not exchange your authorisation code. Try <b>/connect</b> again.</p>`);
  }
});

// ── Global Middleware ─────────────────────────────────────────────────────────
// Single connectDB() for every incoming bot update (Warning 6 fix).
// Also acts as the global command interceptor: if the message is a slash-command,
// aggressively reset any stale transient state so the user never gets permanently stuck.
bot.use(async (ctx, next) => {
  // Ensure DB is connected for every update — idempotent, no extra latency on warm connections.
  await connectDB();

  if (ctx.message?.text?.startsWith('/')) {
    try {
      if (ctx.from) {
        await User.updateOne(
          { telegramId: String(ctx.from.id) },
          {
            $set:   { inputState: 'idle' },
            $unset: { pendingPostText: '', pendingMediaIds: '', mediaDoneMessageId: '' },
          }
        );
      }
    } catch (err) {
      console.error('[Interceptor] State reset failed:', err.message);
    }
  }
  return next();
});

// ── Bot Commands ──────────────────────────────────────────────────────────────

bot.start(async (ctx) => { return handleStart(ctx); });

bot.command('generate', async (ctx) => {
  return handleGenerateFlow(ctx);
});

bot.command('setstyle', async (ctx) => {
  await startSetupPrompt(ctx);
});

bot.command('connect', async (ctx) => {
  if (!LINKEDIN_ENABLED) return ctx.reply('⚠️ LinkedIn integration is not configured on this server.');
  await ctx.reply(
    '🔗 *Connect your LinkedIn account*\n\n' +
    `[👉 Connect LinkedIn](${buildAuthUrl(String(ctx.from.id))})\n\n` +
    '_Only your OAuth access token is stored — never your password._',
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

bot.command('settings', async (ctx) => {
  try {
    const user = await User.findOne({ telegramId: String(ctx.from.id) });
    if (!user) return ctx.reply('No account found. Send /start to get going!');

    // Determine LinkedIn status
    const hasToken = !!user.linkedinAccessToken;
    const expired = hasToken && user.linkedinTokenExpiry && new Date() >= new Date(user.linkedinTokenExpiry);
    const liStatus = !hasToken ? '❌ Not connected'
      : expired ? '⚠️ Session expired — send /connect to re-authorise'
        : '✅ Connected';

    const chat = await ctx.telegram.getChat(ctx.chat.id);
    const hasPinned = !!chat.pinned_message;

    await ctx.reply(
      `⚙️ *Your current settings:*\n\n` +
      `• Template: ${hasPinned ? '✅ Pinned in chat' : '❌ No template pinned (Using default Postbot style)'}\n` +
      `• LinkedIn: ${liStatus}\n\n` +
      `🔒 *Privacy & Security:*\nFor your security, you can run /deldata at any time to permanently delete all of this data from our database (keeping only your Telegram ID and Name).\n`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄 New Template', 'change_prefs')]]),
      }
    );
  } catch (err) {
    console.error('[/settings] Error:', err);
    await ctx.reply('😔 Could not load your settings. Please try again.');
  }
});

bot.command('help', (ctx) => ctx.reply(
  'What I can do:\n' +
  '✨ The Postbot Flow: Complete a quick one-time setup > speak your mind into a voice note > re-generate with some modifications only if you want > and publish directly to LinkedIn.\n\n' +
  '🎛️ Commands:\n' +
  '/start - Kick off smart onboarding to extract your unique writing style.\n' +
  '/generate - Record a voice note and let me generate your next post.\n' +
  '/setstyle - Manually customize your preferred layouts, tone, and formatting.\n' +
  '/connect - Securely link your LinkedIn account for instant publishing.\n' +
  '/settings - View your current configuration and brand guidelines.\n' +
  '/deldata - 🔒 SECURITY: Run this command to permanently clear all your data from the database. This deletes your preferred styles, layout, tone, LinkedIn credentials, and all generation history, keeping only your Telegram ID and Name.\n' +
  '/help - Display this quick guide to all available commands.'
));

bot.command('deldata', async (ctx) => {
  const telegramId = String(ctx.from.id);
  try {
    await ctx.deleteMessage().catch(() => { });

    const user = await User.findOne({ telegramId });

    // Guard: user might not exist
    if (!user) {
      return ctx.reply('ℹ️ No account found to delete. Send /start to create one.');
    }

    await User.updateOne(
      { telegramId },
      {
        $unset: {
          preferredStyles: '', preferredLayout: '', preferredTone: '',
          onboardingComplete: '', linkedinAccessToken: '', linkedinRefreshToken: '',
          linkedinTokenExpiry: '', inputState: '', pendingPostText: '',
          pendingMediaIds: '', mediaDoneMessageId: '',
        },
        $set:  { delDataAt: new Date() },
        $inc:  { countDelData: 1 },       // preserve the audit counter
      }
    );

    try {
      await ctx.telegram.unpinAllChatMessages(ctx.chat.id);
    } catch (e) {
      console.warn('[deldata] Unable to unpin messages:', e.message);
    }

    await ctx.reply(
      '🗑️ All your data, including your pinned style templates and LinkedIn connections, have been permanently deleted.\n\n' +
      'Only your Telegram ID and First Name have been kept to allow you to interact with the bot again.\n\n' +
      'Send /start to set up Postbot again from scratch.',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[/deldata] Error:', err);
    await ctx.reply('😔 Something went wrong. Please try again.');
  }
});

// ── Bot Actions ───────────────────────────────────────────────────────────────

bot.action('change_prefs',   async (ctx) => { return handleChangePrefs(ctx); });
bot.action(/^ob_flow:(.+)$/, async (ctx) => { return handleFlowPick(ctx); });

// /generate flow
bot.action('gen_use_default', async (ctx) => { return handleUseDefault(ctx); });
bot.action('gen_saved',       async (ctx) => { return promptGenerate(ctx); });
bot.action('gen_new',         async (ctx) => { return startSetupPrompt(ctx); });

// Generic post actions (text extracted from callback message — no DB index lookup)
bot.action('action_post',         async (ctx) => { return handleActionPost(ctx); });
bot.action('action_modify',       async (ctx) => { return handleActionModify(ctx); });
bot.action('action_attach_media', async (ctx) => { return handleActionAttachMedia(ctx); });

// Media upload done or cancel
bot.action('media_done_post', async (ctx) => { return handleMediaDonePost(ctx); });
bot.action('cancel_media',    async (ctx) => { return handleActionCancelMedia(ctx); });

bot.on('voice',         async (ctx) => { return handleVoice(ctx); });
bot.on('text',          async (ctx) => { return handleText(ctx); });

bot.on(['photo', 'video'], async (ctx) => {
  const telegramId = String(ctx.from.id);
  const user = await User.findOne({ telegramId });

  // Only accept media after the user has clicked "📸 Attach Media & Post" on a generated post
  if (user && user.inputState === 'awaiting_media_upload') {
    let fileId;
    if (ctx.message.photo) {
      fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
    }

    if (fileId) {
      // Remove the previous "Done" prompt so the chat stays clean
      if (user.mediaDoneMessageId) {
        await ctx.telegram.deleteMessage(ctx.chat.id, user.mediaDoneMessageId).catch(() => {});
      }

      user.pendingMediaIds.push(fileId);

      const doneMsg = await ctx.reply(
        `✅ Media attached (${user.pendingMediaIds.length} total). Send another, or click Done to post.`,
        {
          reply_to_message_id: ctx.message.message_id,
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Done and Post', 'media_done_post')],
            [Markup.button.callback('❌ Cancel Media Attach', 'cancel_media')]
          ]),
        }
      );

      user.mediaDoneMessageId = doneMsg.message_id;
      await user.save();
      return;
    }
  }

  // Not in the media upload phase — guide the user
  return ctx.reply('🎙 Please generate a post and select one first before sending media.');
});

bot.catch((err, ctx) => {
  console.error(`[Bot] Uncaught error for update ${ctx?.update?.update_id}:`, err);
  if (ctx) ctx.reply('😔 An unexpected error occurred. Please try again.').catch(() => { });
});

module.exports = app;