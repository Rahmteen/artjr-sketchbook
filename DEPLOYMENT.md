# Deploying to Vercel

This app runs on Vercel with the **client** (Vite SPA) served as static assets and the **server** (Express API) as a serverless function under `/api/*`.

## What's configured

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

   - **Server / API (required for DB):**  
     - **`SUPABASE_URL`** – your Supabase project URL (Dashboard → Project Settings → API)  
     - **`SUPABASE_SERVICE_ROLE_KEY`** – service role key from the same page  
     The API uses Supabase's REST API for the database (HTTPS only). Run **`supabase-schema.sql`** once in Supabase SQL Editor (step 4).

   - **Storage (recommended on Vercel):**  
     - `USE_SUPABASE_STORAGE=true` – uploads go to Supabase Storage  
     - `SUPABASE_STORAGE_BUCKET` – optional, default `audio`  

   - `PORT` – optional; Vercel sets this for the function

4. **Create the database schema and RPCs in Supabase (once):**  
   In Supabase: **SQL Editor** → New query → paste the contents of **`supabase-schema.sql`** from this repo → Run.  
   This creates all tables and the two RPCs (`run_sql_query`, `run_sql_exec`) used by the API. Without this step, the API will fail when handling requests.  
   **After** running the schema (or any change to those RPCs), run in the SQL Editor: **`NOTIFY pgrst, 'reload schema';`** so PostgREST reloads its schema cache. Otherwise you may get 500s with PGRST202 ("Could not find the function ... in the schema cache").

5. **Redeploy** after saving env vars so the build and runtime use them.

## Database and storage on Vercel

- **Database:** The app uses **Supabase REST only**. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no direct Postgres URL or pooler is used.

- **Uploads:** Use **Supabase Storage** on Vercel (local disk is read-only). Set `USE_SUPABASE_STORAGE=true` and the same `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Troubleshooting

### 500 / PGRST202: "Could not find the function ... in the schema cache"

The API calls Supabase RPCs `run_sql_query` and `run_sql_exec` with parameters **(params, query)**. PostgREST must see those exact function signatures in its schema cache. If you still have the old (query, params) definitions or the cache wasn’t reloaded, you get 404/500 and PGRST202.

**Fix in one go (same project as `SUPABASE_URL` in Vercel):**

1. Open **Supabase Dashboard** → project that matches your `SUPABASE_URL` (e.g. `https://xxxx.supabase.co`).
2. **SQL Editor** → New query.
3. Paste and run the following (it updates both RPCs and reloads the schema cache):

```sql
-- RPCs: params first, query second (required for PostgREST). Params passed as single array; $1,$2 in query become $1[1],$1[2].
CREATE OR REPLACE FUNCTION run_sql_query(params text[], query text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sql text;
BEGIN
  v_sql := regexp_replace(query, '\$([0-9]+)', '$1[\1]', 'g');
  RETURN QUERY EXECUTE (
    'SELECT row_to_json(r)::jsonb FROM (' || v_sql || ') AS r'
  ) USING params;
END;
$$;

CREATE OR REPLACE FUNCTION run_sql_exec(params text[], query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sql text;
BEGIN
  v_sql := regexp_replace(query, '\$([0-9]+)', '$1[\1]', 'g');
  EXECUTE v_sql USING params;
END;
$$;

NOTIFY pgrst, 'reload schema';
```

4. Retry the app (no redeploy needed). If 500s persist, confirm you’re in the **same** Supabase project as the one in Vercel’s `SUPABASE_URL`.

### Debug: which DB mode is running?

In **Vercel** → your project → **Deployments** → select a deployment → **Functions** → open the API function log. On cold start you should see:

`[db] mode= supabase-rest | SUPABASE_URL set= true | SUPABASE_SERVICE_ROLE_KEY set= true`

If you see RPC errors, check **`[db] Supabase REST ... error:`** in the logs and ensure `supabase-schema.sql` has been run in Supabase (tables + RPCs).

### Debug: upload / "The page could not be found" (NOT_FOUND) on sketch upload

1. **Client logs (browser console):** Look for **`[upload client] POST /api/upload/sketch`** and **`[upload client] response 404`** (and error body).

2. **Function logs** (Vercel → Deployments → your deployment → **Functions** → open the API function log). Trigger an upload and look for:
   - **`[vercel] handler invoked POST /api/upload/sketch`** – If you **never** see this, the 404 is from Vercel before your function runs (routing/build/config).
   - **`[api] POST path= /api/upload/sketch`** – request reached Express.
   - **`[upload] POST /sketch reached | hasFile= true`** – upload route ran.
   - **`[upload] POST /sketch success`** – upload and DB/storage succeeded.
   - **`[upload] POST /sketch error:`** – server-side error.

   If **`[vercel] handler invoked`** never appears: check that the repo has `api/[[...path]].ts` and `api/upload/sketch.ts`, the build does not exclude `api/`, and no rewrite sends `/api/*` elsewhere.

3. **Vercel request body limit:** Serverless functions have a **4.5 MB** request body limit. Larger uploads get **413** or may fail before reaching the app. For files &gt; 4.5 MB use direct upload to Supabase Storage from the client, then call your API to register the sketch.

4. **Storage:** Set **`USE_SUPABASE_STORAGE=true`** and **`SUPABASE_URL`** / **`SUPABASE_SERVICE_ROLE_KEY`** so files go to Supabase Storage.

## Local vs Vercel

- **Local:** Run `npm run dev` (client) and `npm run server` (API). Vite proxies `/api` to the server. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` (same Supabase project as prod).
- **Vercel:** One deploy serves both: static from `dist/`, API from the serverless function. No separate "server" process.
