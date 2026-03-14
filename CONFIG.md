# ART JR Sketchbook – DB & config

## Current setup (SQLite + local storage)

The app runs with **no external services** by default.

### Env vars (see `.env.example`)

| Variable | Used by | Default | Description |
|----------|---------|---------|-------------|
| `VITE_ENTRY_CODE` | Frontend | `1234` | 4-digit gate code. |
| `VITE_API_URL` | Frontend | (same origin) | API base URL if not using Vite proxy. |
| `PORT` | Server | `3001` | API server port. |
| `SQLITE_DIR` | Server | `./data` | Directory for SQLite DB file. |
| `UPLOAD_DIR` | Server | `./data/uploads` | Directory for uploaded audio files. |
| `BASE_URL` | Server | `req.protocol + host` | Origin for share links (e.g. `https://yourapp.com`). |

### What gets created

- **SQLite DB:** `{SQLITE_DIR}/sketchbook.db` (tables created on first run).
- **Uploads:** `{UPLOAD_DIR}/` (one file per sketch/reference, keyed by UUID).

No DB or Supabase setup is required for this mode.

---

## Optional: Supabase (DB + storage)

To use **Supabase** for database and file storage instead of SQLite + local disk:

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API** copy:
   - **Project URL**
   - **anon (public) key**
   - **service_role key** (server-only; keep secret).

### 2. Env vars to add

```env
# Supabase (server)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...   # server-only, never expose to frontend

# Optional: use Supabase Storage for files (see below)
USE_SUPABASE_STORAGE=true
```

Frontend can use Supabase only if you add auth later; for the current gate + server API, only the server needs these.

### 3. Database schema in Supabase

Run this in the Supabase **SQL Editor** (one-off) to create tables:

```sql
-- Sketches
CREATE TABLE IF NOT EXISTS sketches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES sketches(id),
  version INTEGER NOT NULL DEFAULT 1,
  version_label TEXT,
  title TEXT NOT NULL,
  description TEXT,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  bpm REAL,
  duration_seconds REAL,
  key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reference-only audio (not in sketches list)
CREATE TABLE IF NOT EXISTS reference_audio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notes on sketches
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sketch_id UUID NOT NULL REFERENCES sketches(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('timestamp', 'general')),
  time_seconds REAL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sketch references (link, another sketch, or reference audio)
CREATE TABLE IF NOT EXISTS sketch_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sketch_id UUID NOT NULL REFERENCES sketches(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('link', 'sketch', 'reference_audio')),
  url TEXT,
  target_sketch_id UUID REFERENCES sketches(id),
  reference_audio_id UUID REFERENCES reference_audio(id),
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Share tokens
CREATE TABLE IF NOT EXISTS share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sketch_id UUID NOT NULL REFERENCES sketches(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_sketch ON notes(sketch_id);
CREATE INDEX IF NOT EXISTS idx_refs_sketch ON sketch_references(sketch_id);
CREATE INDEX IF NOT EXISTS idx_share_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_sketches_group ON sketches(group_id);
```

Note: current app uses `TEXT` IDs (UUID strings). The above uses Postgres `UUID`; if you keep the server as-is you’d keep `id TEXT` and use `gen_random_uuid()::text` or your own UUIDs.

### 4. Supabase Storage (for audio files)

When `USE_SUPABASE_STORAGE=true` and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, the server uses a Supabase Storage bucket for all audio (sketches and reference audio). Otherwise, files are stored on disk in `UPLOAD_DIR`.

**Env vars:**

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_SUPABASE_STORAGE` | (unset) | Set to `true` to use Supabase Storage instead of local disk. |
| `SUPABASE_STORAGE_BUCKET` | `audio` | Bucket name for audio files. |

**Setup:**

1. In Supabase: **Storage → New bucket** (e.g. `audio`, private).
2. Add a policy so the server can read/write (e.g. with **service_role** or a dedicated role).
3. Set `USE_SUPABASE_STORAGE=true`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

The server (`server/storage.ts`) uses the bucket for upload, stream (signed URL + fetch for GET audio/download), and delete. Duration is computed from the upload buffer (no read from storage). See `.env.example` for the optional vars.

### 5. Using Supabase as the DB only (files still on disk)

- Add `@supabase/supabase-js` and create a client with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- In `server/db.ts`, replace `better-sqlite3` with Supabase client calls (e.g. `.from('sketches').select()`, `.insert()`, `.update()`, `.delete()`).
- Keep `server/storage.ts` as-is (local disk), or switch to Supabase Storage as above.

---

## Summary

- **Default:** no DB or Supabase config; set only env vars in `.env` if you want (e.g. `VITE_ENTRY_CODE`, `PORT`).
- **Supabase DB:** set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, run the SQL above, and swap the server’s DB layer to Supabase.
- **Supabase Storage:** create bucket + policy, then replace file read/write in `server/storage.ts` with Supabase Storage API.
