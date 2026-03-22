'use strict';

require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

// Validate required env vars
for (const key of ['TELEGRAM_BOT_TOKEN', 'WEBHOOK_DOMAIN', 'WEBHOOK_SECRET_TOKEN', 'GEMINI_API_KEY', 'MONGODB_URI']) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required env var: ${key}`);
    process.exit(1);
  }
}

// Warn if LinkedIn vars are missing
const missingLinkedIn = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'].filter(k => !process.env[k]);
if (missingLinkedIn.length) {
  console.warn(`[WARN] LinkedIn env vars not set: ${missingLinkedIn.join(', ')}. LinkedIn features disabled.`);
}
const LINKEDIN_ENABLED = missingLinkedIn.length === 0;

const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN.replace(/\/$/, '');
const WEBHOOK_PATH   = '/webhook/telegram';
const WEBHOOK_URL    = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;

const { handleStart, handleChangePrefs, handleStylePick, handleLayoutPick, handleTonePick } = require('./src/handlers/onboarding');
const { handleVoice }                                          = require('./src/handlers/voice');
const { handlePostAction, handleRevisePick }                   = require('./src/handlers/actions');
const { handleText }                                           = require('./src/handlers/text');
const { exchangeCodeForToken, buildAuthUrl }                   = require('./src/services/linkedin');
const User                                                     = require('./src/models/User');
const { updateSession, STEPS }                                 = require('./src/state/sessionStore');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();

// DB connection caching for serverless
let dbReady = false;
async function connectDB() {
  if (dbReady || mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  dbReady = true;
  console.log('[DB] Connected to MongoDB');
}

app.use(express.json());

// Telegram webhook
app.post(WEBHOOK_PATH, async (req, res) => {
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }
  try {
    await connectDB();
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Webhook] Error:', err);
    res.status(200).send('OK');
  }
});

// Register webhook with Telegram
app.get('/setup', async (req, res) => {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET });
    res.send(`✅ Webhook set to: ${WEBHOOK_URL}`);
  } catch (err) {
    res.status(500).send(`❌ Failed: ${err.message}`);
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await connectDB();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// LinkedIn OAuth callback
app.get('/auth/linkedin/callback', async (req, res) => {
  if (!LINKEDIN_ENABLED) return res.status(503).send('LinkedIn not configured.');

  const { code, state: telegramId, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`<h2>❌ LinkedIn connection failed</h2><p>${error_description || error}</p><p>Return to Telegram and send <b>/connect</b> to try again.</p>`);
  }
  if (!code || !telegramId) {
    return res.status(400).send('<h2>❌ Bad Request</h2><p>Missing required parameters.</p>');
  }

  try {
    await connectDB();
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);

    await User.findOneAndUpdate(
      { telegramId },
      { $set: { linkedinAccessToken: accessToken, linkedinRefreshToken: refreshToken, linkedinTokenExpiry: new Date(Date.now() + expiresIn * 1000) } },
      { upsert: false }
    );

    await bot.telegram.sendMessage(
      telegramId,
      '🎉 *LinkedIn connected!*\n\nTap "✅ Post This Option" on any post to publish directly to LinkedIn.\n\n🎙 Send a voice note to get started!',
      { parse_mode: 'Markdown' }
    );

    return res.send('<h2>✅ LinkedIn connected!</h2><p>You can close this tab and return to Telegram.</p>');
  } catch (err) {
    console.error('[LinkedIn OAuth] Token exchange failed:', err.message);
    return res.status(500).send(`<h2>❌ Connection failed</h2><p>Could not exchange your authorisation code. Return to Telegram and try <b>/connect</b> again.</p>`);
  }
});

// ── Bot commands ──────────────────────────────────────────────────────────────

bot.start(async (ctx, next) => { await connectDB(); return handleStart(ctx, next); });

bot.command('connect', async (ctx) => {
  if (!LINKEDIN_ENABLED) return ctx.reply('⚠️ LinkedIn integration is not configured on this server.');
  await ctx.reply(
    '🔗 *Connect your LinkedIn account*\n\n' +
    `[👉 Connect LinkedIn](${buildAuthUrl(String(ctx.from.id))})\n\n` +
    '_Your credentials are never stored — only the OAuth access token._',
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

bot.command('settings', async (ctx) => {
  try {
    await connectDB();
    const user = await User.findOne({ telegramId: String(ctx.from.id) });
    if (!user) return ctx.reply('Please send /start first to set up your preferences.');
    const { Markup } = require('telegraf');
    await ctx.reply(
      `⚙️ *Your current settings:*\n\n` +
      `• Writing styles: ${(user.preferredStyles || []).join(', ')}\n` +
      `• Layout: ${user.preferredLayout || 'Not set'}\n` +
      `• Tone: ${user.preferredTone || 'Not set'}\n`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Update Preferences', 'change_prefs')]]),
      }
    );
  } catch (err) {
    console.error('[/settings] Error:', err);
    await ctx.reply('😔 Could not load your settings. Please try again.');
  }
});

bot.command('help', (ctx) => ctx.reply(
  '📖 *Postbot Help*\n\n' +
  '*Commands:*\n' +
  '• /start — launch Postbot\n' +
  '• /connect — link your LinkedIn account\n' +
  '• /settings — view & update your preferences\n' +
  '• /delData — delete all your data from our database\n' +
  '• /help — show this message\n\n' +
  '*How it works:*\n' +
  '1. Send a voice note with your raw thoughts\n' +
  '2. Get 3 polished LinkedIn posts\n' +
  '3. Post directly to LinkedIn, or tap Modify to refine any post\n\n' +
  '_Voice notes must be under 2 minutes._',
  { parse_mode: 'Markdown' }
));

bot.command('delData', async (ctx) => {
  const telegramId = String(ctx.from.id);
  try {
    await connectDB();

    // Try to delete the /delData command message from chat
    await ctx.deleteMessage().catch(() => {});

    await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          preferredStyles:      [],
          preferredLayout:      'Single block',
          preferredTone:        'Professional',
          onboardingComplete:   false,
          linkedinAccessToken:  null,
          linkedinRefreshToken: null,
          linkedinTokenExpiry:  null,
          delDataAt:            new Date(),
        },
        $inc: { countDelData: 1 },
      },
      { upsert: false }
    );

    // Reset in-memory session to idle
    updateSession(telegramId, { step: STEPS.IDLE, posts: [], temp: {} });

    await ctx.reply(
      '🗑 *Your data has been deleted.*\n\n' +
      'The following has been cleared:\n' +
      '• LinkedIn credentials\n' +
      '• Content preferences (style, layout, tone)\n\n' +
      'Send /start to set up Postbot again.',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[/delData] Error:', err);
    await ctx.reply('😔 Something went wrong. Please try again.');
  }
});

// ── Bot action handlers ────────────────────────────────────────────────────────

bot.action('change_prefs',     async (ctx, next) => { await connectDB(); return handleChangePrefs(ctx, next); });
bot.action(/^ob_style:(.+)$/,  async (ctx, next) => { await connectDB(); return handleStylePick(ctx, next); });
bot.action(/^ob_layout:(.+)$/, async (ctx, next) => { await connectDB(); return handleLayoutPick(ctx, next); });
bot.action(/^ob_tone:(.+)$/,   async (ctx, next) => { await connectDB(); return handleTonePick(ctx, next); });

// Post ID-based callbacks: post_<telegramId_YYYYMMDD_HHMMSS_index>
bot.action(/^post_(.+)$/,        async (ctx, next) => { await connectDB(); return handlePostAction(ctx, next); });
// Revise pick ID-based callbacks: revise_pick_<telegramId_YYYYMMDD_HHMMSS_index>
bot.action(/^revise_pick_(.+)$/, async (ctx, next) => { await connectDB(); return handleRevisePick(ctx, next); });

bot.on('voice', async (ctx, next) => { await connectDB(); return handleVoice(ctx, next); });
bot.on('text',  async (ctx, next) => { await connectDB(); return handleText(ctx, next); });

bot.catch((err, ctx) => {
  console.error(`[Bot] Uncaught error for update ${ctx?.update?.update_id}:`, err);
  if (ctx) ctx.reply('😔 An unexpected error occurred. Please try again.').catch(() => {});
});

module.exports = app;
