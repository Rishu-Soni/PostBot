# PostBot

An npm-workspaces monorepo containing the **PostBot** frontend and backend applications.

## Project Structure

```text
PostBot/
├── package.json          # Root workspace configuration & orchestration scripts
├── .gitignore            # Git ignore patterns for workspaces, builds & env
├── README.md             # Repository documentation
├── frontend/             # React + Vite + Tailwind CSS Single-Page Application
└── backend/              # Node.js + Express REST API Server
```

---

## Getting Started

### 1. Installation

Run `npm install` once at the root directory to install all dependencies for both `frontend` and `backend` workspaces simultaneously:

```bash
npm install
```

### 2. Running Locally in Development

Start both frontend and backend development servers concurrently with a single command:

```bash
npm run dev
```

- **Frontend**: Accessible at `http://localhost:5173` (labeled `[FRONTEND]` in blue)
- **Backend**: Accessible at `http://localhost:5000` (labeled `[BACKEND]` in green)
  - Health check endpoint: `GET http://localhost:5000/health` -> `{ "status": "ok" }`

---

## Available Scripts (from Root)

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs both `frontend` (Vite) and `backend` (Nodemon) dev servers concurrently. |
| `npm run build` | Builds the `frontend` production assets into `frontend/dist/`. |
| `npm run start:backend` | Starts the production `backend` server (`node src/server.js`). |

---

## Deployment Architecture

The frontend and backend are designed for **separate, independent deployments**:

- **Frontend (`frontend/`)**:
  - Deploys as a static SPA to **Cloudflare Pages** (or Vercel / Netlify).
  - Build command: `npm run build` (output directory: `dist/`).
  - Contains no server-side routes or Node-only runtime dependencies.

- **Backend (`backend/`)**:
  - Deploys as a persistent Node.js service to **Render** or **Railway**.
  - Build/Start command: `npm run start` (`node src/server.js`).
  - Supports persistent connections such as MongoDB (Mongoose) and background workers (BullMQ/Redis).
