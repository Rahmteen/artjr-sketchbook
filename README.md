# ART JR Sketchbook

A simple, dark-mode platform for ART JR to manage song sketches: upload audio, add metadata (BPM, key, duration), notes (timestamp + general), references (links, other sketches, reference-only audio), versioning, and share links.

## Stack

- **Frontend:** React 18, TypeScript, Vite, React Router, Zustand
- **Backend:** Express, SQLite (better-sqlite3), local file storage
- **Gate:** 4-digit code (env `VITE_ENTRY_CODE`, default `1234`)

## Requirements

- **Node.js 20.19+** (or 22.12+). Vite 7 and some deps require it. If you see “Vite requires Node.js version 20.19+”, upgrade Node.
- npm

### Upgrading Node

- **nvm:** `nvm install 20` then `nvm use 20`
- **fnm:** `fnm install 20` then `fnm use 20`
- **Direct:** [nodejs.org](https://nodejs.org/) — install the LTS (20.x or 22.x)

## Setup

1. Clone and install:
   ```bash
   cd artjr-sketchbook
   npm install
   ```

2. Optional: copy env and set entry code:
   ```bash
   cp .env.example .env
   # Edit .env: set VITE_ENTRY_CODE to your 4-digit code
   ```

3. Run backend and frontend (two terminals):
   ```bash
   # Terminal 1 – API (creates ./data for SQLite + uploads)
   npm run server

   # Terminal 2 – Frontend (proxies /api to backend)
   npm run dev
   ```

4. Open http://localhost:5173, enter the 4-digit code (default `1234`), then use **Upload sketch** to add audio.

## Scripts

- `npm run dev` – Vite dev server (frontend only; needs API on 3001)
- `npm run server` – Express API on port 3001 (SQLite + uploads in `./data`)
- `npm run build` – Build frontend to `dist`
- `npm run preview` – Serve `dist` (API must be run separately for full app)

## Features

- **Gate:** 4-digit code; session persists ~24h in localStorage
- **Sketches:** List and detail with playback, download, metadata (title, description, BPM, key, duration)
- **Upload:** New sketch or reference-only audio; optional BPM/key; duration from file
- **Versioning:** “New version” creates a new sketch linked to the previous one
- **Replace:** Replace audio file for an existing sketch
- **Notes:** Timestamp notes (with jump-to) and general notes; add/delete
- **References:** Link, another sketch, or reference-only audio; add/delete
- **Share link:** Generate a link that allows access to a single sketch (no gate); optional expiry

## Data

- SQLite DB and uploaded files live under `./data/` (gitignored). To reset, delete the `data` folder and restart the server.

## Bucket storage (future)

The plan suggested Supabase or Cloudflare R2 for production. The current backend uses local disk; you can swap the storage layer in `server/storage.ts` and keep the same API.
