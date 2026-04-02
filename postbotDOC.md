# Postbot Backend Documentation

Postbot is a Telegram bot that acts as an elite ghostwriter, converting users' raw voice notes into polished, viral-ready LinkedIn posts. The backend is built with Node.js, Express, Telegraf, Mongoose (MongoDB), and the Google GenAI SDK.

---

## Architecture Overview

The backend is designed to be **maximally stateless**: the Telegram chat history is the source of truth for generated post text. Nothing about the content of generated posts is stored in the database. The database holds only user **preferences** and a minimal **media-upload session** when the user attaches files.

### Core Technologies

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Web framework | Express |
| Telegram framework | Telegraf |
| Database | MongoDB via Mongoose |
| AI | Google GenAI SDK (`gemini-2.5-flash`) |
| HTTP client | Axios |

### Folder Structure

```
index.js                  →  Entry point: Express app, webhook, LinkedIn OAuth callback, all bot bindings
src/
  handlers/
    onboarding.js         →  /start, /generate, /setstyle flows (Manual Setup & Analyze Example)
    voice.js              →  Voice note ingestion, generation pipeline, sendPostMessages helper
    text.js               →  ForceReply revision handler, Analyze Example text interceptor
    actions.js            →  Generic inline button handlers (post, modify, attach media, media done)
  models/
    User.js               →  Mongoose schema: preferences + minimal media-session state
  services/
    gemini.js             →  Prompt construction, Gemini API calls, JSON parsing
    linkedin.js           →  OAuth, token management, media upload, UGC post publishing
```

---

## Key Features & Workflows

### 1. Onboarding (`/start`, `/setstyle`)

New users are guided to configure their writing style via two paths:

- **Smart Onboarding (Analyze Example):** User pastes a real LinkedIn post (≥ 80 characters). The bot pins the message in the chat and calls Gemini to extract the user's `preferredTone` and `preferredStyles`. The pinned message is fetched dynamically via `ctx.telegram.getChat()` at generation time — the text is **never stored in the database**.

- **Manual Setup:** 3-step inline-button wizard (Layout → Style → Tone). Includes a `🔙 Back` button for step navigation without data loss.

After completing either path, `onboardingComplete` is set to `true`.

### 2. Post Generation (`/generate` + Voice Note)

The core pipeline:

1. User sends `/generate` — bot checks existing preferences and presents appropriate options.
2. User sends a voice note (≤ 120s, ≤ 10 MB).
3. The bot fetches the pinned message (layout reference), downloads the voice file, and calls Gemini.
4. **3 separate Telegram messages** are sent — one per generated option — each with:
   - `✅ Post this` → publishes directly to LinkedIn
   - `✏️ Modify this` → opens a ForceReply refinement prompt
   - `📸 Attach Media & Post` → opens a media upload session

This replaces the previous single-message carousel. No post text is stored in MongoDB.

### 3. Post Modification (Infinitely Repeatable)

When the user clicks `✏️ Modify this`:
1. The bot reads the post text from `ctx.callbackQuery.message.text`.
2. It sends a **ForceReply** message with `MODIFY_MARKER` followed by the original post text embedded inline.
3. The user replies with **text** or a **voice note**.
4. The handler re-extracts the original post from the quoted message — **zero DB reads required** for the original content.
5. 3 new variations are returned as separate messages. The cycle repeats indefinitely.

### 4. Media Attachment

When the user clicks `📸 Attach Media & Post`:
1. The post text is extracted from the callback message and saved to `user.pendingPostText`.
2. `user.inputState` is set to `'awaiting_media_upload'`.
3. The user sends photos/videos; each gets its `file_id` appended to `user.pendingMediaIds` (capped at 9).
4. The user clicks `✅ Done and Post` → the bot reads `pendingPostText` + `pendingMediaIds`, uploads to LinkedIn, and clears the session fields.

### 5. LinkedIn Integration (`/connect`)

OAuth 2.0 flow:
- `/connect` sends the user an authorization link.
- After authorization, the OAuth callback (`/auth/linkedin/callback`) exchanges the code, stores `linkedinAccessToken`, `linkedinRefreshToken`, and `linkedinTokenExpiry` in DB.
- `getValidAccessToken()` transparently refreshes expired tokens. If the token is within 7 days of expiry and a refresh token exists, it silently refreshes in the background.

### 6. Data Management (`/settings`, `/deldata`)

- `/settings` displays current preferences and LinkedIn status. Includes a security notice recommending `/deldata`.
- `/deldata` uses `$unset` to **permanently remove** all preference and session fields, keeping only `telegramId`, `firstName`, and the audit fields (`delDataAt`, `countDelData`). The `countDelData` counter is preserved via `$inc` for audit purposes.

---

## Database Schema (`User.js`)

| Field | Type | Purpose |
|---|---|---|
| `telegramId` | String (unique) | Primary identifier |
| `firstName` | String | Display name |
| `preferredStyles` | [String] | Writing style choices (up to 3) |
| `preferredLayout` | String | Layout template name |
| `preferredTone` | String | Tone name |
| `onboardingComplete` | Boolean | Whether setup is done |
| `inputState` | String | `'idle'` or `'awaiting_media_upload'` |
| `pendingPostText` | String | Post text saved for media upload session |
| `pendingMediaIds` | [String] | Telegram file IDs queued for media post |
| `mediaDoneMessageId` | Number | Message ID of the "Done and Post" prompt (for cleanup) |
| `linkedinAccessToken` | String | LinkedIn OAuth access token |
| `linkedinRefreshToken` | String | LinkedIn OAuth refresh token |
| `linkedinTokenExpiry` | Date | Token expiry timestamp |
| `delDataAt` | Date | Timestamp of last `/deldata` call |
| `countDelData` | Number | Number of times user has deleted their data |

> **Removed fields (previously present, now deleted):**
> `currentPosts`, `selectedPostIndex`, `isNewUser`, `pendingVoiceFileId`, `pendingMediaChoice`, `pendingRefinementHint`

---

## Gemini Integration (`gemini.js`)

- **Lazy SDK init:** `GoogleGenAI` is instantiated on first use, not at module load, preventing issues during serverless cold-start before env vars are available.
- **Timer cleanup:** The `TIMEOUT` `Promise.race` clears its `setTimeout` in a `finally` block to prevent timer leaks under load.
- **Schema-enforced JSON:** All three Gemini callers (`generatePosts`, `revisePosts`, `extractPreferences`) use `responseSchema` so the model is structurally constrained at the API level — no regex parsing.
- **Correct MIME type:** Voice notes are declared as `audio/ogg; codecs=opus` (Telegram's actual encoding).

---

## Environment Variables

**Required:**

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `WEBHOOK_DOMAIN` | Public URL of the deployment |
| `WEBHOOK_SECRET_TOKEN` | Token to verify Telegram webhook requests |
| `GEMINI_API_KEY` | Google AI Studio key |
| `MONGODB_URI` | MongoDB connection string |

**Optional (LinkedIn features):**

| Variable | Description |
|---|---|
| `LINKEDIN_CLIENT_ID` | LinkedIn application client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn application client secret |
| `LINKEDIN_REDIRECT_URI` | OAuth callback URL |

---

## Deployment Notes

- **Serverless (Vercel):** The `connectDB()` function checks `mongoose.connection.readyState === 1` before attempting reconnection. No in-memory caching variables (`dbReady`) that can go stale across cold-starts.
- **Webhook registration:** Hit `GET /setup` once after deployment to register the Telegram webhook and bot commands.
- **Health check:** `GET /health` returns DB connectivity status.
- **No session middleware:** `Telegraf.session()` is not used. All state lives in MongoDB or the Telegram message payload.
