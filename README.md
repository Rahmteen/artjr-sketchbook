# ART JR Sketchbook

A simple, dark-mode platform for ART JR to manage song sketches: upload audio, add metadata (BPM, key, duration), notes (timestamp + general), references (links, other sketches, reference-only audio), versioning, and share links.

## Stack

- **Frontend:** React 18, TypeScript, Vite, React Router, Zustand
- **Backend:** Express, Supabase (REST API for DB; optional Supabase Storage for files)
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

2. Copy env and set Supabase credentials (required):
   ```bash
   cp .env.example .env
   # Edit .env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Dashboard → Project Settings → API)
   # Optionally set VITE_ENTRY_CODE (default 1234)
   ```

3. Run the schema once in Supabase: **SQL Editor** → paste contents of **`supabase-schema.sql`** → Run.

4. Run backend and frontend (two terminals):
   ```bash
   # Terminal 1 – API (uses Supabase for DB)
   npm run server

   # Terminal 2 – Frontend (proxies /api to backend)
   npm run dev
   ```

5. Open http://localhost:5173, enter the 4-digit code (default `1234`), then use **Upload sketch** to add audio.

## Scripts

- `npm run dev` – Vite dev server (frontend only; needs API on 3001)
- `npm run server` – Express API on port 3001 (Supabase for DB; uploads to Supabase Storage or `./data/uploads` if not set)
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

- **Database:** Supabase (same project for local and production). Run `supabase-schema.sql` once in the Supabase SQL Editor.
- **Uploads:** With `USE_SUPABASE_STORAGE=true`, files go to your Supabase bucket. Otherwise they go to `./data/uploads` (gitignored).
