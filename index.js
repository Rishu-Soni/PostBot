'use strict';

require('dotenv').config();

const express    = require('express');
const mongoose   = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

// Validate required env vars at startup
for (const key of ['TELEGRAM_BOT_TOKEN', 'WEBHOOK_DOMAIN', 'WEBHOOK_SECRET_TOKEN', 'GEMINI_API_KEY', 'MONGODB_URI']) {
  if (!process.env[key]) { console.error(`[FATAL] Missing required env var: ${key}`); process.exit(1); }
}

const LINKEDIN_VARS    = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'];
const LINKEDIN_ENABLED = LINKEDIN_VARS.every(k => process.env[k]);
if (!LINKEDIN_ENABLED) console.warn(`[WARN] LinkedIn env vars not set. LinkedIn features disabled.`);

const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN.replace(/\/$/, '');
const WEBHOOK_PATH   = '/webhook/telegram';
const WEBHOOK_URL    = `${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;

const { handleStart, handleChangePrefs, handleStylePick, handleLayoutPick, handleTonePick,
        startStyleSetup, promptGenerate }       = require('./src/handlers/onboarding');
const { handleVoice }                           = require('./src/handlers/voice');
const { handlePostAction, handleRevisePick }    = require('./src/handlers/actions');
const { handleText }                            = require('./src/handlers/text');
const { exchangeCodeForToken, buildAuthUrl }    = require('./src/services/linkedin');
const User                                      = require('./src/models/User');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();

// DB connection caching (serverless-friendly)
let dbReady = false;
async function connectDB() {
  if (dbReady || mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  dbReady = true;
  console.log('[DB] Connected to MongoDB');
}

app.use(express.json());

// ── Express Routes ─────────────────────────────────────────────────────────────

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

app.get('/setup', async (req, res) => {
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL, { secret_token: WEBHOOK_SECRET });

    // Register the 7 bot menu commands visible to every user
    await bot.telegram.setMyCommands([
      { command: 'start',    description: 'Launch Postbot' },
      { command: 'generate', description: 'Start generating a post' },
      { command: 'setStyle', description: 'Set preferred post style' },
      { command: 'connect',  description: 'Link your LinkedIn account' },
      { command: 'settings', description: 'View & update your preferences' },
      { command: 'delData',  description: 'Delete your data from our database' },
      { command: 'help',     description: 'Show help message' },
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

    await User.findOneAndUpdate(
      { telegramId },
      { $set: { linkedinAccessToken: accessToken, linkedinRefreshToken: refreshToken, linkedinTokenExpiry: new Date(Date.now() + expiresIn * 1000) } }
    );

    await bot.telegram.sendMessage(
      telegramId,
      '🎉 *LinkedIn connected!*\n\nTap "✅ Post This Option" on any post to publish directly to LinkedIn.\n\n🎙 Send a voice note to get started!',
      { parse_mode: 'Markdown' }
    );

    return res.send('<h2>✅ LinkedIn connected!</h2><p>You can close this tab and return to Telegram.</p>');
  } catch (err) {
    console.error('[LinkedIn OAuth] Token exchange failed:', err.message);
    return res.status(500).send(`<h2>❌ Connection failed</h2><p>Could not exchange your authorisation code. Try <b>/connect</b> again.</p>`);
  }
});

// ── Bot Commands ──────────────────────────────────────────────────────────────

bot.start(async (ctx) => { await connectDB(); return handleStart(ctx); });

bot.command('generate', async (ctx) => {
  await connectDB();
  const user = await User.findOne({ telegramId: String(ctx.from.id) });
  if (user?.onboardingComplete) {
    await promptGenerate(ctx);
  } else {
    await ctx.reply('⚙️ Let\'s set up your preferences first before generating.');
    await startStyleSetup(ctx);
  }
});

bot.command('setStyle', async (ctx) => {
  await connectDB();
  await startStyleSetup(ctx);
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
    await connectDB();
    const user = await User.findOne({ telegramId: String(ctx.from.id) });
    if (!user) return ctx.reply('No account found. Send /start to get going!');

    // Determine LinkedIn status
    const hasToken = !!user.linkedinAccessToken;
    const expired  = hasToken && user.linkedinTokenExpiry && new Date() >= new Date(user.linkedinTokenExpiry);
    const liStatus = !hasToken ? '❌ Not connected'
                   : expired  ? '⚠️ Session expired — send /connect to re-authorise'
                               : '✅ Connected';

    await ctx.reply(
      `⚙️ *Your current settings:*\n\n` +
      `• Writing styles: ${user.preferredStyles?.length ? user.preferredStyles.join(', ') : 'Not set'}\n` +
      `• Layout: ${user.preferredLayout || 'Not set'}\n` +
      `• Tone: ${user.preferredTone || 'Not set'}\n` +
      `• LinkedIn: ${liStatus}\n`,
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
  '• /start — Launch Postbot\n' +
  '• /generate — Start generating a post\n' +
  '• /setStyle — Set preferred post style\n' +
  '• /connect — Link your LinkedIn account\n' +
  '• /settings — View & update your preferences\n' +
  '• /delData — Delete your data from our database\n' +
  '• /help — Show this message\n\n' +
  '*How it works:*\n' +
  '1. Send /generate then record a voice note with your raw thoughts\n' +
  '2. Get 3 polished LinkedIn posts instantly\n' +
  '3. Tap Post to publish, or Modify to refine any post\n\n' +
  '_Voice notes must be under 2 minutes._',
  { parse_mode: 'Markdown' }
));

bot.command('delData', async (ctx) => {
  const telegramId = String(ctx.from.id);
  try {
    await connectDB();
    await ctx.deleteMessage().catch(() => {});

    const result = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: {
          preferredStyles: [], preferredLayout: 'Single block', preferredTone: 'Professional',
          onboardingComplete: false, linkedinAccessToken: null, linkedinRefreshToken: null,
          linkedinTokenExpiry: null, delDataAt: new Date(),
        },
        $inc: { countDelData: 1 },
      }
    );

    // Guard: user might not exist (e.g. typed /delData before ever starting the bot)
    if (!result) {
      return ctx.reply('ℹ️ No account found to delete. Send /start to create one.');
    }

    await ctx.reply(
      '🗑 *Your data has been deleted.*\n\n' +
      'Cleared: LinkedIn credentials & content preferences.\n\n' +
      'Send /start to set up Postbot again.',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[/delData] Error:', err);
    await ctx.reply('😔 Something went wrong. Please try again.');
  }
});

// ── Bot Actions ───────────────────────────────────────────────────────────────

bot.action('change_prefs',     async (ctx) => { await connectDB(); return handleChangePrefs(ctx); });
bot.action(/^ob_style:(.+)$/,  async (ctx) => { await connectDB(); return handleStylePick(ctx); });
bot.action(/^ob_layout:(.+)$/, async (ctx) => { await connectDB(); return handleLayoutPick(ctx); });
bot.action(/^ob_tone:(.+)$/,   async (ctx) => { await connectDB(); return handleTonePick(ctx); });
bot.action('post_action',      async (ctx) => { await connectDB(); return handlePostAction(ctx); });
bot.action('revise_action',    async (ctx) => { await connectDB(); return handleRevisePick(ctx); });

bot.on('voice', async (ctx) => { await connectDB(); return handleVoice(ctx); });
bot.on('text',  async (ctx) => { await connectDB(); return handleText(ctx); });

bot.catch((err, ctx) => {
  console.error(`[Bot] Uncaught error for update ${ctx?.update?.update_id}:`, err);
  if (ctx) ctx.reply('😔 An unexpected error occurred. Please try again.').catch(() => {});
});

module.exports = app;
