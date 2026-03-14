# Deploying to Vercel

This app runs on Vercel with the **client** (Vite SPA) served as static assets and the **server** (Express API) as a serverless function under `/api/*`.

## What’s configured

- **Build:** `npm run build` (TypeScript + Vite → `dist/`)
- **Static:** Vite output in `dist/` is served as the frontend
- **API:** Requests to `/api/*` are handled by the Express app in `api/[[...path]].ts`
- **SPA fallback:** All non-API routes are rewritten to `/index.html` so client-side routing works

## Deploy steps

1. **Push the repo to GitHub** (or connect your Git provider in Vercel).

2. **Import the project in Vercel**  
   [vercel.com/new](https://vercel.com/new) → Import this repo.  
   Vercel should detect Vite and use the existing `vercel.json` (build command and rewrites).

3. **Set environment variables** in the Vercel project (Settings → Environment Variables):

   - **Client (optional):**  
     - `VITE_ENTRY_CODE` – gate code (e.g. `1234`)  
     - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` – if the client talks to Supabase  
     - `VITE_API_URL` – leave unset to use same origin (recommended when API is on Vercel)

   - **Server / API:**  
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – required if you use Supabase storage  
     - `USE_SUPABASE_STORAGE=true` – recommended on Vercel so uploads go to Supabase  
     - `SUPABASE_STORAGE_BUCKET` – optional, default `audio`  
     - `PORT` – optional; Vercel sets this for the function

4. **Redeploy** after saving env vars so the build and runtime use them.

## Important: database and file storage on Vercel

- **Serverless functions are stateless and ephemeral.** The filesystem is read-only except `/tmp`, and `/tmp` is not shared between invocations and is cleared between deploys.

- **SQLite:** The app uses `better-sqlite3` with a file under `data/sketchbook.db` (or `SQLITE_DIR`). On Vercel this would end up in a temporary or read-only path, so:
  - **Data is not persistent** across requests or deploys.
  - For a real deployment you should replace SQLite with a hosted database (e.g. Supabase Postgres, Turso, or another provider) and adapt the server code to use it.

- **Uploads:** Local disk uploads (`data/uploads`) are not suitable on Vercel. Use **Supabase Storage**:
  - Set `USE_SUPABASE_STORAGE=true`
  - Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPABASE_STORAGE_BUCKET`).

Summary: for a production-like deploy on Vercel, use **Supabase Storage** for files and plan to move from SQLite to a **hosted database** so data persists.

## Local vs Vercel

- **Local:** Run `npm run dev` (client) and `npm run server` (API). Vite proxies `/api` to the server.
- **Vercel:** One deploy serves both: static from `dist/`, API from the `api/[[...path]].ts` serverless function. No separate “server” process.
