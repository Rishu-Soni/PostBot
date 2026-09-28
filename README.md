# PostBot

A repository containing the **PostBot** frontend and backend applications as two independent, standalone projects.

## Project Structure

```text
PostBot/
├── .gitignore            # Git ignore patterns for builds, dependencies & env
├── README.md             # Repository documentation
├── frontend/             # Standalone React + Vite + Tailwind CSS Single-Page Application
└── backend/              # Standalone Node.js + Express REST API Server
```

---

## Getting Started

Frontend and backend are fully independent standalone npm projects. Each has its own dependencies, `package.json`, and `package-lock.json`, and is run in its own terminal.

### 1. Installation

Install dependencies for each project in its respective folder:

```bash
# Terminal 1 - Backend
cd backend
npm install

# Terminal 2 - Frontend
cd frontend
npm install
```

### 2. Running Locally in Development

Run each application in its own separate terminal:

#### Terminal 1 — Backend (API Server)
```bash
cd backend
npm run dev
```
- Accessible at `http://localhost:5000`
- Health check endpoint: `GET http://localhost:5000/health` -> `{ "status": "ok" }`

#### Terminal 2 — Frontend (Vite Dev Server)
```bash
cd frontend
npm run dev
```
- Accessible at `http://localhost:5173`

---

### 3. Local Redis Setup (Background Jobs & BullMQ)

PostBot uses Redis to back BullMQ for scheduled daily posting jobs.

#### Recommended: Run Redis via Docker
On Windows, Redis has no official native Windows distribution, making **Docker** the standard and recommended solution (Docker is already available on your machine).

To start a local Redis container in the background:

```bash
docker run -d -p 6379:6379 --name postbot-redis redis:alpine
```

- **Restart existing container**: `docker start postbot-redis`
- **Stop container**: `docker stop postbot-redis`
- **Verify connection**: The backend default `REDIS_URL` is `redis://127.0.0.1:6379`.

#### Alternative: Native `redis-server` (macOS / Linux / WSL2)
If you are running on macOS, Linux, or within a Windows WSL2 terminal:

```bash
# Ubuntu / WSL2
sudo apt update && sudo apt install redis-server
redis-server

# macOS (Homebrew)
brew install redis
brew services start redis
```

#### Running Without Redis (Mock Mode)
If you want to run the application without starting Redis locally, set:

```env
MOCK_EXTERNAL_APIS=true
```

in `backend/.env`. PostBot will automatically use an in-memory `ioredis-mock` adapter with simulated background job queues, completely bypassing real Redis port connections.

---

## Available Scripts

### Backend (`cd backend`)

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs the development server with Nodemon (`src/server.js`). |
| `npm start` | Runs the production backend server (`node src/server.js`). |

### Frontend (`cd frontend`)

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server on `http://localhost:5173`. |
| `npm run build` | Builds the frontend production assets into `dist/`. |
| `npm run preview` | Previews the production build locally. |

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
