# Postbot Backend Documentation

Postbot is a Telegram bot that acts as an elite ghostwriter, converting users' raw voice notes into highly polished, viral-ready LinkedIn posts. The backend is built with Node.js, Express, Telegraf (for Telegram API integration), Mongoose (for MongoDB), and uses the Google Gemini AI for processing and generating content.

## Architecture Overview

The backend is designed to be potentially deployed in a serverless environment (like Vercel, given the presence of `vercel.json` and the structure of webhook handling) or as a standalone Node.js process.

### Core Technologies
- **Runtime:** Node.js (>= 18.0.0)
- **Web Framework:** Express
- **Telegram Framework:** Telegraf
- **Database:** MongoDB (via Mongoose)
- **AI Integration:** Google GenAI SDK (`gemini-2.5-flash` model)

### Folder Structure
- `index.js`: The main entry point. Initializes the express app, sets up the Telegram webhook, manages MongoDB connections, handles LinkedIn OAuth callbacks, and registers all bot commands and actions.
- `src/handlers/`: Contains the logic for processing different types of Telegram updates.
  - `onboarding.js`: Manages the 3-step setup flow for new users to choose their preferred writing style, layout, and tone using interactive inline keyboards.
  - `voice.js`: Handles incoming voice messages (the core input medium).
  - `text.js`: Handles incoming text messages (fallback or supplementary input/prompts).
  - `actions.js`: Processes callbacks from inline buttons (e.g., choosing to post to LinkedIn, revise a post).
- `src/models/`: Contains database schemas.
  - `User.js`: Schema for storing user settings, onboarding status, style preferences, and LinkedIn OAuth credentials linked to their `telegramId`.
- `src/services/`: Integrates with external APIs.
  - `gemini.js`: Constructs the rigorous system prompt to enforce the "elite LinkedIn ghostwriter" persona, sends audio data or text instructions to the Gemini model, and strictly parses the JSON response containing the 3 generated posts/variations.
  - `linkedin.js`: Handles building authentication URLs and exchanging codes for access tokens with the LinkedIn API.
- `src/state/`: (Presumably) Manages any temporary state or utilities related to state, although the recent updates indicate a push toward a stateless architecture utilizing the database and Telegram callback data.

## Key Features & Workflows

1. **User Onboarding (`/start`, `/setStyle`)**
   New users are guided through a setup process to define their brand guidelines. They select from predefined arrays of Styles (e.g., "Punchy & Direct", "Storytelling"), Layouts ("Single block", "Bullet points"), and Tones ("Professional", "Motivational"). These preferences are saved in the database.

2. **Post Generation (`/generate`, Voice Input)**
   The core flow. A user sends a voice note. The bot transcribes/processes this using Gemini and applies the precise user preferences. The `gemini.js` service instructs the AI to generate exactly 3 alternative posts adhering to viral writing rules (compelling hooks, no jargon, relevant hashtags) and returns them as an array. 

3. **Post Refinement**
   Users can choose one of the generated options and provide further text instructions to revise it. The system then generates 3 new variations based on that specific post and the new instructions.

4. **LinkedIn Integration (`/connect`)**
   Users can connect their LinkedIn accounts via OAuth 2.0. Once authorized, access tokens and expiry times are saved in the DB, enabling direct, one-click posting from Telegram to LinkedIn ("✅ Post This Option").

5. **Data Management (`/settings`, `/delData`)**
   Users can view their current config and status. To ensure privacy and compliance, users can completely wipe their content preferences and LinkedIn tokens using the `/delData` command.

## Environment Variables
The application strictly requires the following configuration:
- `TELEGRAM_BOT_TOKEN`: Provided by BotFather.
- `WEBHOOK_DOMAIN`: The public domain where the webhook is hosted.
- `WEBHOOK_SECRET_TOKEN`: Security token to verify incoming requests from Telegram.
- `GEMINI_API_KEY`: Google AI Studio key.
- `MONGODB_URI`: Connection string for the database.

*(Optional but required for full features)*
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`: For LinkedIn OAuth.

## Deployment Notes
The server exposes an Express webhook endpoint at `/webhook/telegram` for taking updates. It includes a `/setup` route to programmatically set the webhook and bot commands on Telegram's side, and a `/health` route for uptime tracking. Connection checks for MongoDB (`dbReady`) are optimized for potentially ephemeral environments.
