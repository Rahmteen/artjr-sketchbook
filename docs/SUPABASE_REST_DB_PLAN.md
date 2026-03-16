# Plan: Keep Everything in Supabase, No Pooler (REST-Only DB Access)

**Implemented.** The app now uses Supabase REST only for the database (no SQLite, no pg/pooler). See `server/db.ts` and `supabase-schema.sql` (RPCs `run_sql_query`, `run_sql_exec`). Local and Vercel both require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## Goal (historical)

- **Single place for everything**: DB, storage, and app config stay in your Supabase project.
- **No pooler (and no direct Postgres) from Vercel**: The shared pooler stays problematic (ENOTFOUND, connection limits). So we **stop using `pg` from the Express server on Vercel entirely**.
- **How**: Use **Supabase’s REST API** for database access from the server. The Express app already uses `@supabase/supabase-js` for storage (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). We add a **DB path that uses the same client** to read/write tables over HTTPS. No TCP to `db.xxx.supabase.co` or to the pooler — only HTTPS to `https://xxx.supabase.co`.

No new “build” or separate backend: same Vercel deploy (frontend + API), same Supabase project; only the **server’s DB access** switches from `pg` (pooler/direct) to Supabase REST.

---

## Options for Implementing “DB via REST”

### Option A: RPC (Postgres functions)

- **Idea**: Move the “heavy” or join-heavy SQL into **Postgres functions** in Supabase. The server calls them with `supabase.rpc('function_name', { param1: value1, ... })`.
- **Pros**: Keeps SQL in one place (Supabase migrations), minimal change to route structure (routes call RPCs instead of `db.prepare`), and you can keep almost the same SQL (with `$1, $2` and array params).
- **Cons**: You need to define and maintain one function per logical operation (or a few generic ones).

### Option B: Supabase client API only

- **Idea**: Replace every `db.prepare(...)` with Supabase client calls: `.from('table').select().eq()`, `.insert()`, `.update()`, `.delete()`. For joins (e.g. tags per sketch, collections per sketch), use multiple `.from().select()` and assemble in JS, or use Supabase’s nested/embedded resources where possible.
- **Pros**: No stored procedures; everything is in app code.
- **Cons**: Larger refactor; some queries (especially multi-table joins and `IN (...)` lists) become more verbose or require several round-trips.

### Option C: Hybrid (recommended)

- **Simple CRUD**: Use the Supabase client: `.from('sketches').select()`, `.insert()`, etc. Single-table reads/writes stay straightforward.
- **Complex / join-heavy**: Use **RPC** with Postgres functions that run your existing SQL (e.g. “tags for sketches”, “collections for sketches”, filtered list with tags). The server then only calls `supabase.rpc(...)` and gets back the same shapes as today.

This keeps the pooler out of the picture, keeps all data in Supabase, and avoids a single huge refactor while still moving off `pg` on Vercel.

---

## Env and Config

- **When “Supabase DB” is on** (e.g. `USE_SUPABASE_DB=true` or “on Vercel and no pooler”):  
  - Use **only** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for DB (same as storage).  
  - Do **not** use `DATABASE_URL` or `DATABASE_POOLER_URL` for the serverless API.
- **When off** (e.g. local): Keep current behavior (SQLite or, if you set `DATABASE_URL`, Postgres via `pg` for non-Vercel).

So: **no pooler required** for the Vercel + Supabase path; only Supabase REST.

---

## Implementation Outline

1. **Supabase-backed DB layer**
   - New module (or branch in `server/db.ts`) that uses `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
   - Expose the same async interface routes expect: e.g. `prepare(sql).get(params)`, `.all(params)`, `.run(params)` — **or** a small set of helpers (e.g. `getSketch(id)`, `listSketches(tagIds?)`, `getTagsForSketches(ids)`, …) that map to Supabase client + RPC. The second avoids “translating” raw SQL to REST in the middle layer.

2. **Implement each logical query**
   - **Simple**: Map to Supabase client (`.from('table').select().eq()`, `.insert()`, etc.).
   - **Complex / joins**: Add Postgres functions in Supabase that run the existing SQL (or equivalent), call them with `.rpc()`, and optionally keep a thin adapter so route code still receives the same row shapes (e.g. `getTagsForSketches(sketchIds)` → `supabase.rpc('get_tags_for_sketches', { sketch_ids: sketchIds })`).

3. **Config**
   - When `USE_SUPABASE_DB=true` (or when on Vercel and we decide “no pg”), use the Supabase REST layer; otherwise keep SQLite (and optional `pg` for local Postgres). Remove or bypass any `pg`/pooler usage on Vercel so **no** pooler or direct DB URL is required.

4. **Docs**
   - Update `DEPLOYMENT.md`: “On Vercel you can use Supabase REST for DB: set `USE_SUPABASE_DB=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; you do **not** need `DATABASE_URL` or `DATABASE_POOLER_URL` for the serverless API.”

---

## Summary

| Aspect | Current (problem) | After (goal) |
|--------|--------------------|-------------|
| DB location | Supabase (good) | Same Supabase (unchanged) |
| Connection from Vercel | `pg` → pooler or direct | **No** `pg`; Supabase REST only |
| Pooler / ENOTFOUND | Possible | Not used |
| Storage | Supabase client | Unchanged |
| Build / deploy target | Vercel (frontend + API) | Same |

So instead of “creating a build” elsewhere, we keep everything managed in Supabase and avoid the shared pooler by having the server talk to Supabase only over HTTPS (REST), not over a Postgres connection.
