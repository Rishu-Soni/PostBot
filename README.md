# Postbot Backend

Postbot is an AI-powered Telegram bot that acts as an elite ghostwriter, converting users' raw text and voice notes into polished, viral-ready LinkedIn posts. 

It leverages Google's Gemini 2.5 Flash model for content generation and integrates directly with the LinkedIn API to publish text and media posts seamlessly from within Telegram.

## 🚀 Key Features

*   **🎙️ Voice Note to Post**: Drop a voice note (up to 120s) into the chat, and Postbot will transcribe and structure it into a compelling LinkedIn post.
*   **🧬 Style DNA Cloning**: Set your writing style by simply pasting an example post. Postbot perfectly mirrors your spacing, tone, emoji usage, and sentence rhythm.
*   **🛡️ Content Firewall**: Postbot separates your *style* from your *facts*. It uses your provided text/audio for the factual content and prevents AI hallucinations.
*   **✏️ Infinite Revisions**: Don't like the generated post? Hit "Modify this", reply with a quick voice note (e.g., "make it shorter and punchier"), and get new variations instantly.
*   **📸 Media Support**: Seamlessly attach photos and videos to your AI-generated posts before publishing them to LinkedIn.
*   **🔐 Privacy-First & Stateless**: Generated posts are **never** stored in the database. The Telegram chat history acts as the sole source of truth. The database is strictly used for minimal state (like OAuth tokens and basic preferences).
*   **🌐 Direct LinkedIn Publishing**: Full OAuth 2.0 flow integrated. Publish directly to LinkedIn with one click from Telegram.

## 🛠️ Technology Stack

*   **Runtime**: Node.js (≥ 18)
*   **Frameworks**: Express (Web server/webhooks), Telegraf (Telegram Bot API)
*   **Database**: MongoDB via Mongoose (Strictly for user preferences and OAuth tokens)
*   **AI Engine**: Google GenAI SDK (`gemini-2.5-flash`)
*   **Deployment**: Ready for serverless environments (e.g., Vercel)

## 📂 Project Structure

*   `index.js`: Main entry point (Express app, Telegram webhooks, OAuth callbacks).
*   `src/handlers/`: Contains modular bot logic (`onboarding.js`, `voice.js`, `text.js`, `actions.js`).
*   `src/models/`: Mongoose schemas (e.g., `User.js`).
*   `src/services/`: External API integrations (`gemini.js`, `linkedin.js`).

## ⚙️ Environment Variables

To run this backend, you'll need to configure the following environment variables in a `.env` file:

```env
# Core Config
TELEGRAM_BOT_TOKEN=your_botfather_token
WEBHOOK_DOMAIN=your_public_domain
WEBHOOK_SECRET_TOKEN=your_custom_secret_token
GEMINI_API_KEY=your_google_ai_studio_key
MONGODB_URI=your_mongodb_connection_string

# LinkedIn Integration (Optional but required for publishing)
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=your_oauth_callback_url
```

## 🚀 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd Postbot_backend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure environment variables:**
    Create a `.env` file based on the provided list above.
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  **Initialize the Webhook:**
    Once deployed or tunneled (e.g., using ngrok), visit `GET /setup` in your browser to register the Telegram webhook commands.

## 📖 Extended Documentation
For a deep dive into the architecture, generative AI constraints, database schema, and handling of Edge/Serverless environments, please refer to the detailed [postbotDOC.md](./postbotDOC.md) file included in this repository.
