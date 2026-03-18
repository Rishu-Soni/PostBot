// index.js
// ─────────────────────────────────────────────────────────────────────────────
// Postbot — Telegram voice-note → LinkedIn posts (via Gemini 1.5 Flash)
// Serverless-ready Express/Telegraf server for Vercel.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── 1. Environment — must be first ────────────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

// ── 2. Validate required environment variables ────────────────────────────────
const REQUIRED_ENV = [
  'TELEGRAM_BOT_TOKEN',
  'WEBHOOK_DOMAIN',
  'WEBHOOK_SECRET_TOKEN',
  'GEMINI_API_KEY',
  'MONGODB_URI',
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const LINKEDIN_OPTIONAL = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'];
const missingLinkedIn = LINKEDIN_OPTIONAL.filter((k) => !process.env[k]);
if (missingLinkedIn.length > 0) {
  console.warn(
    `[WARN] LinkedIn env vars not set: ${missingLinkedIn.join(', ')}. ` +
    `The /connect command and LinkedIn posting will be disabled.`
  );
}
const LINKEDIN_ENABLED = missingLinkedIn.length === 0;

// ── 3. Constants ──────────────────────────────────────────────────────────────
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN.replace(/\/$/, ''); // strip trailing slash
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;
const WEBHOOK_PATH   = '/webhook/telegram';
const WEBHOOK_URL    = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;

// ── 4. Handler imports ────────────────────────────────────────────────────────
const { handleStart, handleChangePrefs, handleStylePick, handleLayoutPick, handleTonePick } =
  require('./src/handlers/onboarding');
const { handleVoice }                                    = require('./src/handlers/voice');
const { handlePostAction, handleReviseAction, handleRevisePick } =
  require('./src/handlers/actions');
const { handleText }                                     = require('./src/handlers/text');
const { exchangeCodeForToken, buildAuthUrl }             = require('./src/services/linkedin');
const User                                               = require('./src/models/User');

// ── 5. Initialise services ────────────────────────────────────────────────────
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();

// ── DB Connection Caching for Serverless ──────────────────────────────────────
let isConnected = false;
async function connectToDatabase() {
  if (isConnected || mongoose.connection.readyState >= 1) {
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  isConnected = true;
  console.log('[DB] Connected to MongoDB');
}

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.json());

// ── 6. Webhook route ────────────────────────────────────────────────────────
app.post(WEBHOOK_PATH, async (req, res) => {
  // Verify secret token
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    console.warn('[Webhook] Unauthorized request: secret token mismatch');
    return res.status(403).send('Forbidden');
  }

  try {
    // Ensure DB is connected
    await connectToDatabase();
    
    // IMPORTANT FOR VERCEL SERVERLESS:
    // We MUST await the update fully BEFORE sending the HTTP response.
    // Sending `res.send()` early causes Vercel to instantly freeze the function,
    // which was why your bot wasn't responding at all.
    await bot.handleUpdate(req.body);
    
    // Acknowledge Telegram only after we finish processing
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Webhook] Error handling update:', err);
    // Don't send 500 to Telegram unless absolutely necessary, or it will infinitely retry.
    res.status(200).send('OK'); 
  }
});

// Setup route to configure Webhook with Telegram
app.get('/setup', async (req, res) => {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET });
    res.send(`✅ Webhook registered successfully to: ${WEBHOOK_URL}`);
  } catch (err) {
    res.status(500).send(`❌ Failed to set webhook: ${err.message}`);
  }
});

// ── 7. Health-check route ─────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await connectToDatabase();
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ── 8. LinkedIn OAuth callback route ─────────────────────────────────────────
app.get('/auth/linkedin/callback', async (req, res) => {
  if (!LINKEDIN_ENABLED) {
    return res.status(503).send('LinkedIn integration is not configured on this server.');
  }

  const { code, state: telegramId, error, error_description } = req.query;

  if (error) {
    console.warn(`[LinkedIn OAuth] Error for user ${telegramId}: ${error} — ${error_description}`);
    return res.status(400).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Postbot – Error</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h2>❌ LinkedIn connection failed</h2>
  <p>${error_description || error}</p>
  <p>Return to Telegram and send <b>/connect</b> to try again.</p>
</body></html>`);
  }

  if (!code || !telegramId) {
    return res.status(400).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Postbot – Error</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h2>❌ Bad Request</h2><p>Missing required parameters.</p>
</body></html>`);
  }

  try {
    await connectToDatabase();
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);

    await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          linkedinAccessToken:  accessToken,
          linkedinRefreshToken: refreshToken,
          linkedinTokenExpiry:  new Date(Date.now() + expiresIn * 1_000),
        },
      },
      { upsert: false }
    );

    await bot.telegram.sendMessage(
      telegramId,
      '🎉 *LinkedIn connected successfully!*\n\n' +
      'You can now tap "✅ Post Option X" to publish posts directly to your LinkedIn profile.\n\n' +
      '🎙 Send a voice note to get started!',
      { parse_mode: 'Markdown' }
    );

    return res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Postbot – Connected!</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h2>✅ LinkedIn connected!</h2>
  <p>You can close this tab and return to Telegram.</p>
</body></html>`);
  } catch (err) {
    console.error('[LinkedIn OAuth] Token exchange failed:', err.message);
    return res.status(500).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Postbot – Error</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px">
  <h2>❌ Connection failed</h2>
  <p>Could not exchange your authorisation code. Please return to Telegram and try <b>/connect</b> again.</p>
</body></html>`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// ── 9. /start ─────────────────────────────────────────────────────────────────
bot.start(async (ctx, next) => { await connectToDatabase(); return handleStart(ctx, next); });

// ── 10. /connect — initiate LinkedIn OAuth ─────────────────────────────────────
bot.command('connect', async (ctx) => {
  if (!LINKEDIN_ENABLED) {
    return ctx.reply(
      '⚠️ LinkedIn integration is not configured on this server yet.\n' +
      'Please contact the bot admin.',
      { parse_mode: 'Markdown' }
    );
  }

  const telegramId = String(ctx.from.id);
  const authUrl = buildAuthUrl(telegramId);

  await ctx.reply(
    '🔗 *Connect your LinkedIn account*\n\n' +
    `Tap the button below to authorise Postbot to post on your behalf.\n\n` +
    `[👉 Connect LinkedIn](${authUrl})\n\n` +
    '_Your credentials are never stored — only the OAuth access token._',
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// ── 11. /settings — show current preferences ──────────────────────────────────
bot.command('settings', async (ctx) => {
  const telegramId = String(ctx.from.id);
  try {
    await connectToDatabase();
    const user = await User.findOne({ telegramId });
    if (!user) {
      return ctx.reply('Please send /start first to set up your preferences.');
    }
    await ctx.reply(
      `⚙️ *Your current settings:*\n\n` +
      `• Writing styles: ${(user.preferredStyles || []).join(', ')}\n` +
      `• Layout: ${user.preferredLayout || 'Not set'}\n` +
      `• Tone: ${user.preferredTone || 'Not set'}\n\n` +
      `To change these, send /start to go through setup again.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[/settings] Error:', err);
    await ctx.reply('😔 Could not load your settings. Please try again.');
  }
});

// ── 12. /help ─────────────────────────────────────────────────────────────────
bot.command('help', (ctx) =>
  ctx.reply(
    '📖 *Postbot Help*\n\n' +
    '*Commands:*\n' +
    '• /start — set up or reset your preferences\n' +
    '• /connect — link your LinkedIn account\n' +
    '• /settings — view your current preferences\n' +
    '• /help — show this message\n\n' +
    '*How it works:*\n' +
    '1. Send a voice note with your raw thoughts\n' +
    '2. Get 3 polished LinkedIn posts\n' +
    '3. Choose one to post directly, or revise it\n\n' +
    '_Voice notes must be under 2 minutes._',
    { parse_mode: 'Markdown' }
  )
);

// ── 13. Onboarding inline button callbacks ─────────────────────────────────────
bot.action('change_prefs',     async (ctx, next) => { await connectToDatabase(); return handleChangePrefs(ctx, next); });
bot.action(/^ob_style:(.+)$/, async (ctx, next) => { await connectToDatabase(); return handleStylePick(ctx, next); });
bot.action(/^ob_layout:(.+)$/, async (ctx, next) => { await connectToDatabase(); return handleLayoutPick(ctx, next); });
bot.action(/^ob_tone:(.+)$/,   async (ctx, next) => { await connectToDatabase(); return handleTonePick(ctx, next); });

// ── 14. Post selection callbacks ───────────────────────────────────────────────
bot.action(/^post_(\d)$/, async (ctx, next) => { await connectToDatabase(); return handlePostAction(ctx, next); });

// ── 15. Revise flow callbacks ──────────────────────────────────────────────────
bot.action('revise',              async (ctx, next) => { await connectToDatabase(); return handleReviseAction(ctx, next); });
bot.action(/^revise_pick_(\d)$/, async (ctx, next) => { await connectToDatabase(); return handleRevisePick(ctx, next); });

// ── 16. Voice messages ─────────────────────────────────────────────────────────
bot.on('voice', async (ctx, next) => { await connectToDatabase(); return handleVoice(ctx, next); });

// ── 17. Text messages ──────────────────────────────────────────────────────────
bot.on('text', async (ctx, next) => { await connectToDatabase(); return handleText(ctx, next); });

// ── 18. Global Telegraf error handler ─────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`[Bot] Uncaught error for update ${ctx?.update?.update_id}:`, err);
  if (ctx) {
    ctx.reply('😔 An unexpected error occurred. Please try again.').catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT FOR VERCEL
// ─────────────────────────────────────────────────────────────────────────────
module.exports = app;
