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
     - **`DATABASE_URL`** – **required for persistent DB.** Use your Supabase Postgres connection string (e.g. `postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres` from Supabase → Project Settings → Database).  
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – required if you use Supabase storage  
     - `USE_SUPABASE_STORAGE=true` – recommended on Vercel so uploads go to Supabase  
     - `SUPABASE_STORAGE_BUCKET` – optional, default `audio`  
     - `PORT` – optional; Vercel sets this for the function

4. **Create the database schema in Supabase (once):**  
   In Supabase: **SQL Editor** → New query → paste the contents of **`supabase-schema.sql`** from this repo → Run.  
   This creates all tables. Without this step, the API will fail when `DATABASE_URL` is set.

5. **Redeploy** after saving env vars so the build and runtime use them.

## Important: database and file storage on Vercel

- **Serverless functions are stateless and ephemeral.** The filesystem is read-only except `/tmp`, and `/tmp` is not shared between instances and is cleared between deploys.

- **SQLite on Vercel:** The server detects Vercel (`VERCEL` env) and uses `/tmp/artjr-sketchbook-data` for the SQLite file so the app can start (no more “ENOENT: mkdir /var/task/data”). That database is **ephemeral**:
  - **Empty on each deploy** and often empty between requests (different serverless instances have different `/tmp`).
  - So **yes, an empty DB on deployment is normal**; sketches and other data will not persist.
  - To get persistent data, set **`DATABASE_URL`** to your Supabase Postgres URL and run **`supabase-schema.sql`** once in Supabase SQL Editor (see above).

- **Uploads:** Local disk uploads (`data/uploads`) are not suitable on Vercel. Use **Supabase Storage**:
  - Set `USE_SUPABASE_STORAGE=true`
  - Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPABASE_STORAGE_BUCKET`).

Summary: for a production-like deploy on Vercel, set **`DATABASE_URL`** (Supabase Postgres), run **`supabase-schema.sql`** once, and use **Supabase Storage** for uploads.

## Local vs Vercel

- **Local:** Run `npm run dev` (client) and `npm run server` (API). Vite proxies `/api` to the server.
- **Vercel:** One deploy serves both: static from `dist/`, API from the `api/[[...path]].ts` serverless function. No separate “server” process.
