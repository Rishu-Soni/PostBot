// server.js
// ─────────────────────────────────────────────────────────────────────────────
// Postbot — Telegram voice-note → LinkedIn posts (via Gemini 1.5 Flash)
// Production-ready Express/Telegraf server with full handler wiring.
//
// Architecture:
//   Express  ─►  Telegraf webhook  ─►  Bot handlers
//                    │                       │
//                    │          ┌────────────┼──────────────┐
//                    │          ▼            ▼              ▼
//                    │        MongoDB     Gemini API    LinkedIn API
//                    │       (Mongoose)  (voice→posts) (OAuth + ugcPosts)
//                    │
//                    └──►  GET /auth/linkedin/callback  (OAuth redirect)
//                    └──►  GET /health                  (monitoring)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── 1. Environment — must be first ────────────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

// ── 2. Validate required environment variables ────────────────────────────────
// Fail fast at startup if any critical variable is missing, rather than
// discovering it at runtime when the first user triggers the broken code path.
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

// LinkedIn vars are optional at startup (bot works without LinkedIn connected).
// We warn instead of exit so the bot can run in voice-note-only mode.
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
const PORT           = process.env.PORT || 3000;
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN.replace(/\/$/, ''); // strip trailing slash
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;
const WEBHOOK_PATH   = '/webhook/telegram';
const WEBHOOK_URL    = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;

// ── 4. Handler imports ────────────────────────────────────────────────────────
const { handleStart, handleStylePick, handleLayoutPick, handleTonePick } =
  require('./src/handlers/onboarding');
const { handleVoice }                                    = require('./src/handlers/voice');
const { handlePostAction, handleReviseAction, handleRevisePick } =
  require('./src/handlers/actions');
const { handleText }                                     = require('./src/handlers/text');
// FIX 10: Import all linkedin functions at top-level (was a lazy require inside /connect handler body).
const { exchangeCodeForToken, buildAuthUrl }             = require('./src/services/linkedin');
const User                                               = require('./src/models/User');

// ── 5. Initialise services ────────────────────────────────────────────────────

// 5a. Telegraf bot — we use webhook mode (not polling) in production.
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 5b. Express app
const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE ORDER IS CRITICAL
// ─────────────────────────────────────────────────────────────────────────────
// bot.webhookCallback() must be mounted BEFORE express.json().
// Telegraf reads the raw request body itself; if Express parses it first,
// the body stream is consumed and Telegraf receives nothing.
//
// The secretToken guard means Telegram embeds the secret in the
// X-Telegram-Bot-Api-Secret-Token header. Requests without it (e.g. probes)
// are rejected with 403 before they reach any bot handler.
// ─────────────────────────────────────────────────────────────────────────────

app.use(bot.webhookCallback(WEBHOOK_PATH, { secretToken: WEBHOOK_SECRET }));
app.use(express.json());

// ── 6. Health-check route ─────────────────────────────────────────────────────
// Used by Render.com, UptimeRobot, etc. to verify the service is up.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 7. LinkedIn OAuth callback route ─────────────────────────────────────────
// Telegram → User → LinkedIn auth URL → User approves → LinkedIn redirects here.
// We exchange the 'code' for an access token and store it in MongoDB.
// The 'state' parameter is the telegramId we passed when building the auth URL.
app.get('/auth/linkedin/callback', async (req, res) => {
  if (!LINKEDIN_ENABLED) {
    return res.status(503).send('LinkedIn integration is not configured on this server.');
  }

  const { code, state: telegramId, error, error_description } = req.query;

  // Handle user denial or LinkedIn error
  if (error) {
    console.warn(`[LinkedIn OAuth] Error for user ${telegramId}: ${error} — ${error_description}`);
    // FIX 11: Proper HTML5 pages with charset and head
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
    // Exchange the authorisation code for tokens.
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForToken(code);

    // Persist to MongoDB.
    await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          linkedinAccessToken:  accessToken,
          linkedinRefreshToken: refreshToken,
          linkedinTokenExpiry:  new Date(Date.now() + expiresIn * 1_000),
        },
      },
      { upsert: false } // don't create — user must exist from /start
    );

    // Notify the user in Telegram.
    // We can't do ctx.reply() here (no active Telegraf context), so we use
    // the bot's telegram.sendMessage() method directly.
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

// ── 8. /start ─────────────────────────────────────────────────────────────────
bot.start(handleStart);

// ── 9. /connect — initiate LinkedIn OAuth ─────────────────────────────────────
bot.command('connect', async (ctx) => {
  if (!LINKEDIN_ENABLED) {
    return ctx.reply(
      '⚠️ LinkedIn integration is not configured on this server yet.\n' +
      'Please contact the bot admin.',
      { parse_mode: 'Markdown' }
    );
  }

  const telegramId = String(ctx.from.id);
  // FIX 10: buildAuthUrl is now imported at the top of the file (no more lazy require)
  const authUrl = buildAuthUrl(telegramId); // telegramId serves as the CSRF state token

  await ctx.reply(
    '🔗 *Connect your LinkedIn account*\n\n' +
    `Tap the button below to authorise Postbot to post on your behalf.\n\n` +
    `[👉 Connect LinkedIn](${authUrl})\n\n` +
    '_Your credentials are never stored — only the OAuth access token._',
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// ── 10. /settings — show current preferences ──────────────────────────────────
bot.command('settings', async (ctx) => {
  const telegramId = String(ctx.from.id);
  try {
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

// ── 11. /help ─────────────────────────────────────────────────────────────────
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

// ── 12. Onboarding inline button callbacks ─────────────────────────────────────
// Regex captures the chosen value after the colon, e.g. "ob_style:Storytelling"
bot.action(/^ob_style:(.+)$/, handleStylePick);
bot.action(/^ob_layout:(.+)$/, handleLayoutPick);
bot.action(/^ob_tone:(.+)$/,   handleTonePick);

// ── 13. Post selection callbacks ───────────────────────────────────────────────
bot.action(/^post_(\d)$/, handlePostAction);

// ── 14. Revise flow callbacks ──────────────────────────────────────────────────
bot.action('revise',              handleReviseAction);
bot.action(/^revise_pick_(\d)$/, handleRevisePick);

// ── 15. Voice messages ─────────────────────────────────────────────────────────
bot.on('voice', handleVoice);

// ── 16. Text messages ──────────────────────────────────────────────────────────
// IMPORTANT: this must be registered AFTER all bot.action() handlers.
// In Telegraf, callback_query updates are separate from message updates, so
// there's no ordering conflict — but keeping actions before text is a
// good defensive practice.
bot.on('text', handleText);

// ── 17. Global Telegraf error handler ─────────────────────────────────────────
// Catches any error thrown inside a bot handler that wasn't caught internally.
// Prevents unhandled rejections from crashing the process.
bot.catch((err, ctx) => {
  console.error(`[Bot] Uncaught error for update ${ctx.update.update_id}:`, err);
  // Attempt a graceful reply — swallow any error from the reply itself.
  ctx.reply('😔 An unexpected error occurred. Please try again.').catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────────────────────────────────────

async function start() {
  try {
    // ── 18. Connect to MongoDB ────────────────────────────────────────────
    // bufferCommands:false ensures Mongoose doesn't silently queue DB operations
    // if the connection drops — they'll fail fast so we can catch and report them.
    await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
    console.log('[DB] Connected to MongoDB');

    // ── 19. Register the Telegram webhook ────────────────────────────────
    // setWebhook() is idempotent — safe to call on every startup.
    // The secret_token ensures only genuine Telegram updates are accepted.
    await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET });
    console.log(`[Telegram] Webhook registered → ${WEBHOOK_URL}`);

    // ── 20. Start Express ─────────────────────────────────────────────────
    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
      console.log(`[Server] Health check → http://localhost:${PORT}/health`);
      if (LINKEDIN_ENABLED) {
        console.log(`[LinkedIn] OAuth callback → ${process.env.LINKEDIN_REDIRECT_URI}`);
      }
    });
  } catch (err) {
    console.error('[FATAL] Startup failed:', err);
    process.exit(1);
  }
}

// ── 21. Graceful shutdown ─────────────────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully…`);
  try {
    await bot.telegram.deleteWebhook();
    console.log('[Telegram] Webhook removed');
    await mongoose.connection.close();
    console.log('[DB] MongoDB connection closed');
  } catch (err) {
    console.error('[Shutdown] Cleanup error:', err.message);
  }
  process.exit(0);
};

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── 22. Global Node.js error handlers ────────────────────────────────────────
// These are the last defence against unhandled errors escaping the event loop.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection] at:', promise, 'reason:', reason);
  // Do NOT exit — log and continue for non-fatal issues.
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
  // Synchronous exceptions leave the process in an undefined state — exit safely.
  gracefulShutdown('uncaughtException');
});

// Boot.
start();
