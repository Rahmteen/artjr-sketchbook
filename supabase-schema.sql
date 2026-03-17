-- Run this once in Supabase: SQL Editor → New query → paste and run.
-- Creates all tables for persistent storage when using DATABASE_URL (Supabase Postgres).

CREATE TABLE IF NOT EXISTS sketches (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  version_label TEXT,
  title TEXT NOT NULL,
  description TEXT,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  bpm REAL,
  duration_seconds REAL,
  key TEXT,
  peaks_json JSONB,
  peaks_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Migration: add peaks_json to existing sketches table (run once if table already existed)
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS peaks_json JSONB;
-- Migration: add peaks_status ('pending' | 'computing' | 'ready' | 'failed') for direct-upload peak computation
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS peaks_status TEXT;

CREATE TABLE IF NOT EXISTS reference_audio (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('timestamp', 'general')),
  time_seconds REAL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sketch_references (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('link', 'sketch', 'reference_audio')),
  url TEXT,
  target_sketch_id TEXT,
  reference_audio_id TEXT,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_tokens (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_sketch ON notes(sketch_id);
CREATE INDEX IF NOT EXISTS idx_refs_sketch ON sketch_references(sketch_id);
CREATE INDEX IF NOT EXISTS idx_share_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_sketches_group ON sketches(group_id);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS collection_tiers (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS sketch_collections (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL REFERENCES sketches(id),
  collection_id TEXT NOT NULL REFERENCES collections(id),
  tier_id TEXT REFERENCES collection_tiers(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(sketch_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_sketch_collections_sketch ON sketch_collections(sketch_id);
CREATE INDEX IF NOT EXISTS idx_sketch_collections_collection ON sketch_collections(collection_id);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);

CREATE TABLE IF NOT EXISTS melodies (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL REFERENCES sketches(id),
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  duration_seconds REAL,
  bpm REAL,
  label TEXT NOT NULL,
  color TEXT,
  offset_ms REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  peaks_json JSONB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_melodies_sketch ON melodies(sketch_id);

-- Migration: add peaks_json to existing melodies table (run once if table already existed)
ALTER TABLE melodies ADD COLUMN IF NOT EXISTS peaks_json JSONB;

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sketch_tags (
  sketch_id TEXT NOT NULL REFERENCES sketches(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (sketch_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_sketch_tags_sketch ON sketch_tags(sketch_id);
CREATE INDEX IF NOT EXISTS idx_sketch_tags_tag ON sketch_tags(tag_id);

-- RPCs for Supabase REST-only DB (USE_SUPABASE_DB=true). Server calls these via supabase.rpc().
-- run_sql_query: for SELECT (prepare().get/all). Returns each row as jsonb.
-- EXECUTE USING does not support VARIADIC; pass params as single array and use $1[1], $1[2], ...
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

-- run_sql_exec: for INSERT/UPDATE/DELETE (prepare().run). Returns void.
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
