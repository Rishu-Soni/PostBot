# Postbot Backend Documentation

Postbot is a Telegram bot that acts as an elite ghostwriter, converting users' raw text and voice notes into polished, viral-ready LinkedIn posts. The backend is built with Node.js, Express, Telegraf, Mongoose (MongoDB), and the Google GenAI SDK.

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

New users are guided to configure their writing style template via two paths:

- **Manual Setup:** The user types a plain-text description of their preferred vibe, tone, layout, and emoji usage (e.g., _"Professional tone, lots of white space, 3 bullet points, minimal emojis"_). The bot sends this description to Gemini, which generates a 250-word dummy LinkedIn post that perfectly captures the style. The bot then **pins this generated post** to the chat. No data is written to the database.

- **Provide Example Post:** The user pastes an actual LinkedIn post (≥ 80 characters) directly into the chat. The bot **pins that exact message** immediately. No AI processing needed; no data written to the database.

In both cases:
- The pinned message becomes the **Exemplar** — the style blueprint used at generation time.
- The bot reads it dynamically via `ctx.telegram.getChat()` whenever a post is generated; it is **never stored in MongoDB**.
- `onboardingComplete` is set to `true` once the pin succeeds.
- Both branches handle the `"not enough rights"` pin permission error gracefully, prompting the user to grant the bot admin pin permission.

After completing either path, the user is prompted to send a text or voice note to generate their first post.

### 2. Post Generation (`/generate` + Text or Voice Note) & Content Firewall

The backend implements a strict **Content Firewall** and **Style DNA Cloning** when communicating with Gemini:
- **Style DNA (Format & Tone):** Extracted exclusively from the pinned Exemplar message. This is a deep, 9-point heuristic clone that maps: *vocabulary register, professionalism level, sentence rhythm, hook style, emoji usage, paragraph spacing, punctuation personality, and emotional register*. Furthermore, strict explicit `\\n` formatting rules are enforced to preserve vertical spacing and avoid the JSON parser flattening the output.
- **Facts (Content Firewall):** Extracted exclusively from the user's text or voice note. The model is forbidden from hallucinating facts, names, or stories from the Exemplar.

The core pipeline:

1. User sends `/generate` — bot checks existing preferences and presents appropriate options.
2. User sends a text message or a voice note (≤ 120s, ≤ 10 MB).
3. The bot fetches the pinned message (layout reference), downloads the voice file (if applicable), and calls Gemini.
4. Gemini's payload is heavily sanitized via a custom `escapeMarkdownV2` utility to prevent Telegram API crashes.
5. **3 separate Telegram messages** are sent — one per generated option — each with:
   - `✅ Post this` → publishes directly to LinkedIn
   - `✏️ Modify this` → opens a ForceReply refinement prompt
   - `📸 Attach Media & Post` → opens a media upload session

This replaces the previous single-message carousel. No post text is stored in MongoDB.

### 3. Post Modification (Infinitely Repeatable)

When the user clicks `✏️ Modify this`:
1. The bot reads the post text from `ctx.callbackQuery.message.text`.
2. It sends a **ForceReply** message containing the original post text, appending an invisible `\u2060POSTBOT_MARKER\u2060` at the end to reliably extract the payload later.
3. The user replies with **text** or a **voice note** containing modification instructions.
4. The handler re-extracts the original post from the quoted message — **zero DB reads required** for the original content.
5. Gemini perfectly mirrors the existing styling while applying the modifications aggressively.
6. 3 new variations are returned as separate messages. The cycle repeats indefinitely.

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
- **Global Command Interceptor:** Any slash command resets stale transient states (`inputState`, `pendingMediaIds`) to ensure the user never gets permanently stuck.
- **Auth Recovery (V-02):** Upon LinkedIn reconnection, previously cached `pendingPostText` is retrieved and sent as a failsafe, plain-text draft so no posts are lost if Telegram's format parsing fails.

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
- **Timer cleanup & High-Demand Recovery:** `timeout` caps are set to 180 seconds, max retries extended to 4. Back-off logic handles 503 server overloads caused by dense 2-minute audio transcripts.
- **Generational Concurrency Lock:** Ensures a single user cannot trigger parallel Gemini jobs to prevent quota abuse or sequence breaking. The lock releases immediately once processing completes.
- **Schema-enforced JSON:** All three Gemini callers (`generatePosts`, `revisePosts`, `extractPreferences`) use `responseSchema` so the model is structurally constrained at the API level — no regex parsing.
- **Explicit Layout Constraints:** Model generation pipelines are instructed to return literal `\\n` and `\\n\\n` sequence blocks within the parsed arrays to avoid `application/json` serialization deleting whitespace.
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
