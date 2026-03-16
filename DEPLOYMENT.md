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
     - **Option A – Supabase REST (no pooler, recommended on Vercel):**  
       Set **`USE_SUPABASE_DB=true`**, **`SUPABASE_URL`**, and **`SUPABASE_SERVICE_ROLE_KEY`**.  
       The API will use Supabase’s REST API for the database (HTTPS only). You do **not** need `DATABASE_URL` or `DATABASE_POOLER_URL`. This avoids pooler/ENOTFOUND issues.  
       Your Supabase project must have the tables and the two RPCs from **`supabase-schema.sql`** (run the whole file once in SQL Editor; see step 4).
     - **Option B – Postgres via pooler:**  
       **`DATABASE_POOLER_URL`** (Vercel) – Required to fix `ENOTFOUND db.xxx.supabase.co` when not using Supabase REST.  
       1. In Supabase: **Project Settings** → **Database**.  
       2. Under **Connection string**, choose **URI** and **Transaction** (not Session).  
       3. Copy the URL (host `aws-0-<region>.pooler.supabase.com`, port **6543**).  
       4. Add `?pgbouncer=true` if not present.  
       5. In Vercel, add **`DATABASE_POOLER_URL`** with this value.  
       **`DATABASE_URL`** – Used locally (and on Vercel if using Option B). Can be the direct or pooler URL.
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – required for Supabase storage and for Option A (REST DB)  
     - `USE_SUPABASE_STORAGE=true` – recommended on Vercel so uploads go to Supabase  
     - `SUPABASE_STORAGE_BUCKET` – optional, default `audio`  
     - `PORT` – optional; Vercel sets this for the function

4. **Create the database schema and RPCs in Supabase (once):**  
   In Supabase: **SQL Editor** → New query → paste the contents of **`supabase-schema.sql`** from this repo → Run.  
   This creates all tables and the two RPCs (`run_sql_query`, `run_sql_exec`) used when **`USE_SUPABASE_DB=true`**. Without this step, the API will fail when using Option A (REST) or when `DATABASE_URL` is set (Option B).

5. **Redeploy** after saving env vars so the build and runtime use them.

## Important: database and file storage on Vercel

- **Serverless functions are stateless and ephemeral.** The filesystem is read-only except `/tmp`, and `/tmp` is not shared between instances and is cleared between deploys.

- **SQLite on Vercel:** The server detects Vercel (`VERCEL` env) and uses `/tmp/artjr-sketchbook-data` for the SQLite file so the app can start (no more “ENOENT: mkdir /var/task/data”). That database is **ephemeral**:
  - **Empty on each deploy** and often empty between requests (different serverless instances have different `/tmp`).
  - So **yes, an empty DB on deployment is normal**; sketches and other data will not persist.
  - To get persistent data, either:
    - **Supabase REST (no pooler):** set **`USE_SUPABASE_DB=true`**, **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`**, and run **`supabase-schema.sql`** once in Supabase SQL Editor; or
    - **Postgres via pooler:** set **`DATABASE_URL`** (and on Vercel **`DATABASE_POOLER_URL`**) and run **`supabase-schema.sql`** once.

- **Uploads:** Local disk uploads (`data/uploads`) are not suitable on Vercel. Use **Supabase Storage**:
  - Set `USE_SUPABASE_STORAGE=true`
  - Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `SUPABASE_STORAGE_BUCKET`).

Summary: for a production-like deploy on Vercel, use **Supabase Storage** for uploads and either **Supabase REST** (`USE_SUPABASE_DB=true` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, no pooler) or **Postgres via pooler** (`DATABASE_URL` + `DATABASE_POOLER_URL`). Run **`supabase-schema.sql`** once in Supabase in both cases.

## Troubleshooting

### Debug: which DB mode is running?

In **Vercel** → your project → **Deployments** → select a deployment → **Functions** → click a serverless function log. On cold start you should see a line like:

`[db] mode= supabase-rest (USE_SUPABASE_DB=true, no pg/pooler) | VERCEL= true | USE_SUPABASE_DB= true ...`

- If you see **`mode= pg`** but you want to use the REST API (no pooler), set **`USE_SUPABASE_DB=true`** in Vercel and ensure **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** are set. You can then remove or leave unset **`DATABASE_URL`** and **`DATABASE_POOLER_URL`** (the app will use Supabase REST for DB).
- If you see **`mode= supabase-rest`** and still get 500s, check for **`[db] Supabase REST ... error:`** in the same logs (RPC errors from the REST API).

### Debug: upload / “The page could not be found” (NOT_FOUND) on sketch upload

1. **Check function logs** (Vercel → Deployments → your deployment → **Functions** → open the API function log). Trigger an upload and look for:
   - **`[api] POST path= /api/upload/sketch`** – request reached Express. If you never see this, the 404 is from Vercel (request not reaching the app; check URL and that the deploy includes the API).
   - **`[upload] POST /sketch reached | hasFile= true`** – upload route ran and multer received a file.
   - **`[upload] POST /sketch success`** – upload and DB/storage succeeded.
   - **`[upload] POST /sketch error:`** – server-side error (message and stack in logs).
   - **`[api] 404 no matching route`** – path didn’t match any route (log shows `path=` and `url=`).

2. **Vercel request body limit:** Serverless functions have a **4.5 MB** request body limit. Larger uploads get **413** (or may fail before reaching the app). For files &gt; 4.5 MB use direct upload to Supabase Storage from the client (e.g. presigned URL or Supabase client with RLS) and then call your API to register the sketch; the repo does not implement that flow yet.

3. **Ensure storage is configured:** Set **`USE_SUPABASE_STORAGE=true`** and **`SUPABASE_URL`** / **`SUPABASE_SERVICE_ROLE_KEY`** so files go to Supabase Storage instead of local disk (which is read-only on Vercel).

### Fix `getaddrinfo ENOTFOUND db.xxx.supabase.co` (Option B only)

If you use **Option A (Supabase REST)** with `USE_SUPABASE_DB=true`, you do not use the pooler or a direct DB URL, so this error does not apply.

If you use **Option B (Postgres via pooler):** Vercel serverless **cannot** use Supabase’s direct URL (`db.xxx.supabase.co`). You must use the **pooler** URL and set it in Vercel.

1. **Get the pooler URL**
   - Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Project Settings** (gear) → **Database**.
   - Scroll to **Connection string**.
   - Select **URI** and **Transaction** (not “Session”).
   - Copy the string. It must have:
     - Host: **`aws-0-<region>.pooler.supabase.com`** (not `db.xxx.supabase.co`)
     - Port: **6543**
   - Replace `[YOUR-PASSWORD]` with your database password.
   - Add **`?pgbouncer=true`** at the end if it’s not there.  
     Example:  
     `postgresql://postgres.wshmjsncbhqatssddpeu:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

2. **Set it in Vercel**
   - Vercel → your project → **Settings** → **Environment Variables**.
   - Add **Name:** `DATABASE_POOLER_URL`, **Value:** the pooler URL from step 1.
   - Select **Production** (and **Preview** if you use previews) → Save.

3. **Redeploy**
   - **Deployments** → ⋮ on latest → **Redeploy** (or push a new commit).

If you skip step 2, the app will keep using `DATABASE_URL` (direct) on Vercel and you’ll keep seeing ENOTFOUND. After redeploy with `DATABASE_POOLER_URL` set, the 500s should stop.

- **`ENOENT: mkdir '/var/task/data'`** – Old deploy without `DATABASE_URL` or before the SQLite-on-Vercel fix. Set `DATABASE_POOLER_URL` (and optionally `DATABASE_URL`) then redeploy.

## Local vs Vercel

- **Local:** Run `npm run dev` (client) and `npm run server` (API). Vite proxies `/api` to the server.
- **Vercel:** One deploy serves both: static from `dist/`, API from the `api/[[...path]].ts` serverless function. No separate “server” process.
