# ART JR Sketchbook – DB & config

## Current setup: Supabase-only DB

The app uses **Supabase** for the database (REST API only; no direct Postgres URL or pooler). Local and Vercel use the same Supabase project.

### Required env vars (see `.env.example`)

| Variable | Used by | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | Server | Supabase project URL (Dashboard → Project Settings → API). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service role key from the same page (server-only; keep secret). |

Without these, the server will not start (DB is required).

### Optional env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ENTRY_CODE` | `1234` | 4-digit gate code. |
| `VITE_API_URL` | (same origin) | API base URL if not using Vite proxy. |
| `PORT` | `3001` | API server port. |
| `UPLOAD_DIR` | `./data/uploads` | Directory for uploaded audio when not using Supabase Storage. |
| `BASE_URL` | from request | Origin for share links. |

### Database schema in Supabase

Run the full **`supabase-schema.sql`** from this repo in the Supabase **SQL Editor** (once per project). It creates all tables and the two RPCs (`run_sql_query`, `run_sql_exec`) used by the server.

---

## Optional: Supabase Storage (for audio files)

When `USE_SUPABASE_STORAGE=true` and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, the server uses a Supabase Storage bucket for all audio (sketches and reference audio). Otherwise, files are stored on disk in `UPLOAD_DIR`.

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_SUPABASE_STORAGE` | (unset) | Set to `true` to use Supabase Storage instead of local disk. |
| `SUPABASE_STORAGE_BUCKET` | `audio` | Bucket name for audio files. |

**Setup:** In Supabase create a bucket (e.g. `audio`), add a policy so the service role can read/write, then set the env vars. Recommended on Vercel (local disk is read-only).

For **large sketch uploads** (e.g. > 4.5 MB, to avoid Vercel's body limit), also set the **client** env vars so the browser can upload directly to Supabase:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Same as server `SUPABASE_URL` (or your project URL). |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key from Dashboard → Project Settings → API. |

With these, the client requests a signed upload URL from the API, uploads the file to Supabase Storage, then calls the API to register the sketch. Without them, uploads go through the API and are limited by Vercel's request body size.

---

## Summary

- **Database:** Supabase REST only. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; run `supabase-schema.sql` once.
- **Storage:** Optional Supabase Storage via `USE_SUPABASE_STORAGE=true`; otherwise local `UPLOAD_DIR`.
