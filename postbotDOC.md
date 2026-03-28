# Postbot Backend Documentation

Postbot is a Telegram bot that acts as an elite ghostwriter, converting users' raw voice notes into highly polished, viral-ready LinkedIn posts. The backend is built with Node.js, Express, Telegraf (for Telegram API integration), Mongoose (for MongoDB), and uses the Google Gemini AI for processing and generating content.

## Architecture Overview

The backend is designed to be fully stateless in-memory, relying entirely on MongoDB for persistent state management and Telegram's callback mechanisms for navigation. It is optimized for serverless deployments (like Vercel).

### Core Technologies
- **Runtime:** Node.js (>= 18.0.0)
- **Web Framework:** Express
- **Telegram Framework:** Telegraf
- **Database:** MongoDB (via Mongoose)
- **AI Integration:** Google GenAI SDK (`gemini-2.5-flash` model)

### Folder Structure
- `index.js`: The main entry point. Initializes the express app, sets up the Telegram webhook, manages MongoDB connections, handles LinkedIn OAuth callbacks, and registers all bot commands and actions.
- `src/handlers/`: Contains the logic for processing different types of Telegram updates.
  - `onboarding.js`: Manages the setup flow for users (both Smart Onboarding via example text and Manual Setup via buttons) to define their default writing style, layout, and tone.
  - `voice.js`: Handles incoming voice messages and manages the transition into the media attachment state (`awaiting_media`).
  - `text.js`: Handles incoming text messages (fallback input, smart onboarding example analysis, and specific post revision prompts).
  - `actions.js`: Processes callbacks from inline buttons (e.g., navigating the Carousel, choosing to post to LinkedIn, refining a post, finalizing media uploads).
- `src/models/`: Contains database schemas.
  - `User.js`: Schema for storing user settings, onboarding status, style preferences, LinkedIn OAuth credentials, and transient generation state (like `inputState`, `pendingMediaIds`, `currentPosts`, `selectedPostIndex`, and `mediaDoneMessageId`).
- `src/services/`: Integrates with external APIs.
  - `gemini.js`: Constructs the system prompts, sends audio/text to Gemini, and strictly parses the JSON response containing the generated posts. Also handles automated preference extraction from example posts.
  - `linkedin.js`: Handles building authentication URLs, exchanging codes for access tokens, and pushing text or media payloads to the LinkedIn API.

## Key Features & Workflows

1. **Smart & Manual User Onboarding (`/start`, `/setStyle`)**
   New users are guided to set their brand guidelines. They can either:
   - **Analyze Example:** Paste a successful post, and the bot will use Gemini to automatically extract the layout and tone. This example is pinned natively in the Telegram chat UI. **Stateless Constraint:** The text is NEVER saved to the database; it is dynamically fetched via the Telegram API (`getChat`) during generation.
   - **Manual Setup:** Interactively define preferences by choosing Layouts ("Short Para", "Achievement", "Promote", "Daily Progress"), Styles, and Tone. Includes an "Undo Back" capability for seamless navigation. These choices are stored persistently.

2. **Post Generation & Media Workflows (`/generate`, Voice Input)**
   The core flow: 
   - User initiates `/generate` (which checks for dynamic pinned data or DB configurations) and sends a voice note (must be < 2 minutes).
   - The bot asks if the user intends to attach media (*"Add media"* vs *"Continue without one"*).
   - The audio and any pinned layouts (fetched live) are sent to Gemini to generate 3 alternative posts adhering to viral writing rules.
   - The bot saves the options to the user's `currentPosts` array in MongoDB and displays the Interactive Post Carousel.
   - **Media Branch:** If media was selected, the Carousel button becomes `✅ Choose this`. Clicking it prompts the user to upload photos/videos. The UI handles multiple uploads cleanly by deleting stale "✅ Done and post" prompts. When done, it publishes directly.
   - **No Media Branch:** If no media was selected, the Carousel button is natively `✅ Post to LinkedIn` for direct text-only publishing.

3. **Interactive Post Carousel**
   To reduce chat clutter, generated choices are presented in a unified single-message Carousel. Users can navigate laterally using `⬅️ Prev` and `Next ➡️` buttons, which instantly edit the message text with the relevant option from the database.

4. **Post Refinement ("Modify This")**
   Users can choose to modify a specific variant directly from the Carousel. The bot leverages Telegram's `ForceReply` mechanism, capturing the user's specific instructions for *that* index, and uses Gemini to revise it while maintaining the original core message.

5. **LinkedIn Integration (`/connect`)**
   Users can connect their LinkedIn accounts securely via OAuth 2.0. Once authorized, access and refresh tokens are managed in DB. Using the `✅ Post to LinkedIn` button in the Carousel lets users publish immediately—complete with any media they attached during the generation phase.

6. **Data Management (`/settings`, `/delData`)**
   Users can check their configuration status via Settings. They can completely wipe their styling preferences, transient generation state, and LinkedIn credentials dynamically via `/delData`, ensuring strong privacy and compliance.

## Environment Variables
The application strictly requires the following configuration:
- `TELEGRAM_BOT_TOKEN`: Provided by BotFather.
- `WEBHOOK_DOMAIN`: The public domain where the webhook is hosted.
- `WEBHOOK_SECRET_TOKEN`: Security token to verify incoming requests from Telegram.
- `GEMINI_API_KEY`: Google AI Studio key.
- `MONGODB_URI`: Connection string for the database.

*(Optional but required for full features)*
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`: For LinkedIn OAuth workflows.

## Deployment Notes
The server exposes an Express webhook endpoint at `/webhook/telegram`. It includes a `/setup` route to programmatically register the webhook domain and bot commands visible to end-users (`/start`, `/generate`, `/setStyle`, `/connect`, `/settings`, `/delData`, `/help`). The architecture avoids holding session state in Node.js memory (`Telegraf.session()` is not used), making it inherently highly scalable and capable of handling serverless spin-downs without data loss.
