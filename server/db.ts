import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const useSupabaseDb = process.env.USE_SUPABASE_DB === 'true';
const usePg = !useSupabaseDb && Boolean(process.env.DATABASE_URL || (process.env.VERCEL && process.env.DATABASE_POOLER_URL));

/** One-time log of DB mode at cold start (no secrets). */
let dbModeLogged = false;
function logDbMode(): void {
  if (dbModeLogged) return;
  dbModeLogged = true;
  const vercel = Boolean(process.env.VERCEL);
  const useSupabaseDbRaw = process.env.USE_SUPABASE_DB;
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasPoolerUrl = Boolean(process.env.DATABASE_POOLER_URL);
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  let mode: string;
  if (useSupabaseDb) {
    mode = 'supabase-rest (USE_SUPABASE_DB=true, no pg/pooler)';
  } else if (usePg) {
    mode = `pg (${vercel && hasPoolerUrl ? 'DATABASE_POOLER_URL' : 'DATABASE_URL'})`;
  } else {
    mode = 'sqlite';
  }
  console.log('[db] mode=', mode, '| VERCEL=', vercel, '| USE_SUPABASE_DB=', useSupabaseDbRaw, '| DATABASE_URL set=', hasDatabaseUrl, '| DATABASE_POOLER_URL set=', hasPoolerUrl, '| SUPABASE_URL set=', hasSupabaseUrl, '| SUPABASE_SERVICE_ROLE_KEY set=', hasServiceRoleKey);
}
// Log once when this module is loaded (cold start).
logDbMode();

/** Convert ? placeholders to $1, $2 for pg */
function toPgParams(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Row = Record<string, unknown>;

// --- SQLite path (sync) ---
let sqliteDb: import('better-sqlite3').Database | null = null;

function getSqlite(): import('better-sqlite3').Database {
  if (!sqliteDb) {
    const Database = require('better-sqlite3') as new (path: string) => import('better-sqlite3').Database;
    const DB_DIR =
      process.env.SQLITE_DIR ??
      (process.env.VERCEL ? join('/tmp', 'artjr-sketchbook-data') : join(process.cwd(), 'data'));
    const DB_PATH = join(DB_DIR, 'sketchbook.db');
    if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
    sqliteDb = new Database(DB_PATH);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS sketches (
        id TEXT PRIMARY KEY, group_id TEXT, version INTEGER NOT NULL DEFAULT 1, version_label TEXT,
        title TEXT NOT NULL, description TEXT, storage_key TEXT NOT NULL, file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL, file_size_bytes INTEGER NOT NULL, bpm REAL, duration_seconds REAL, key TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reference_audio (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, file_size_bytes INTEGER NOT NULL, label TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, sketch_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('timestamp', 'general')), time_seconds REAL, content TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sketch_references (id TEXT PRIMARY KEY, sketch_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('link', 'sketch', 'reference_audio')), url TEXT, target_sketch_id TEXT, reference_audio_id TEXT, label TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS share_tokens (id TEXT PRIMARY KEY, sketch_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_notes_sketch ON notes(sketch_id); CREATE INDEX IF NOT EXISTS idx_refs_sketch ON sketch_references(sketch_id); CREATE INDEX IF NOT EXISTS idx_share_token ON share_tokens(token); CREATE INDEX IF NOT EXISTS idx_sketches_group ON sketches(group_id);
      CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS collection_tiers (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id), label TEXT NOT NULL, sort_order INTEGER NOT NULL, color TEXT);
      CREATE TABLE IF NOT EXISTS sketch_collections (id TEXT PRIMARY KEY, sketch_id TEXT NOT NULL REFERENCES sketches(id), collection_id TEXT NOT NULL REFERENCES collections(id), tier_id TEXT REFERENCES collection_tiers(id), sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(sketch_id, collection_id));
      CREATE INDEX IF NOT EXISTS idx_sketch_collections_sketch ON sketch_collections(sketch_id); CREATE INDEX IF NOT EXISTS idx_sketch_collections_collection ON sketch_collections(collection_id);
      CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, payload_json TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
      CREATE TABLE IF NOT EXISTS melodies (id TEXT PRIMARY KEY, sketch_id TEXT NOT NULL REFERENCES sketches(id), storage_key TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, file_size_bytes INTEGER NOT NULL, duration_seconds REAL, bpm REAL, label TEXT NOT NULL, color TEXT, offset_ms REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_melodies_sketch ON melodies(sketch_id);
      CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS sketch_tags (sketch_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (sketch_id, tag_id), FOREIGN KEY (sketch_id) REFERENCES sketches(id), FOREIGN KEY (tag_id) REFERENCES tags(id));
      CREATE INDEX IF NOT EXISTS idx_sketch_tags_sketch ON sketch_tags(sketch_id); CREATE INDEX IF NOT EXISTS idx_sketch_tags_tag ON sketch_tags(tag_id);
    `);
    const d = sqliteDb;
    const sketchCols = d.prepare("SELECT name FROM pragma_table_info('sketches')").all() as { name: string }[];
    const sketchColNames = new Set(sketchCols.map((c) => c.name));
    if (!sketchColNames.has('collection_id')) d.exec(`ALTER TABLE sketches ADD COLUMN collection_id TEXT REFERENCES collections(id)`);
    if (!sketchColNames.has('tier_id')) d.exec(`ALTER TABLE sketches ADD COLUMN tier_id TEXT REFERENCES collection_tiers(id)`);
    const tierCols = d.prepare("SELECT name FROM pragma_table_info('collection_tiers')").all() as { name: string }[];
    if (!new Set(tierCols.map((c) => c.name)).has('color')) d.exec(`ALTER TABLE collection_tiers ADD COLUMN color TEXT`);
    const needsMigration = d.prepare(`SELECT COUNT(*) as cnt FROM sketches WHERE collection_id IS NOT NULL AND id NOT IN (SELECT sketch_id FROM sketch_collections)`).get() as { cnt: number };
    if (needsMigration.cnt > 0) {
      const migrateRows = d.prepare(`SELECT id, collection_id, tier_id FROM sketches WHERE collection_id IS NOT NULL AND id NOT IN (SELECT sketch_id FROM sketch_collections)`).all() as { id: string; collection_id: string; tier_id: string | null }[];
      const insertSc = d.prepare(`INSERT OR IGNORE INTO sketch_collections (id, sketch_id, collection_id, tier_id, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?)`);
      const now = new Date().toISOString();
      for (const r of migrateRows) insertSc.run(`sc_${r.id}_${r.collection_id}`, r.id, r.collection_id, r.tier_id, now);
    }
  }
  return sqliteDb as import('better-sqlite3').Database;
}

// --- Postgres path (async) ---
let pgPool: import('pg').Pool | null = null;

async function getPg(): Promise<import('pg').Pool> {
  if (!pgPool) {
    const poolerUrl = process.env.DATABASE_POOLER_URL;
    const directUrl = process.env.DATABASE_URL;
    const onVercel = Boolean(process.env.VERCEL);
    if (onVercel) {
      console.log('[db] pg pool initializing on Vercel | using', poolerUrl ? 'DATABASE_POOLER_URL' : 'DATABASE_URL', '| hint: set USE_SUPABASE_DB=true to use Supabase REST instead of pg');
    }
    const { default: pg } = await import('pg');
    // On Vercel, the direct Supabase host (db.xxx.supabase.co) often fails with ENOTFOUND (IPv6/DNS).
    // We must use the Connection pooler (Transaction mode, port 6543, host aws-0-*.pooler.supabase.com).
    let url: string;
    if (onVercel && poolerUrl) {
      url = poolerUrl;
    } else if (directUrl) {
      if (onVercel) {
        try {
          const parsed = new URL(directUrl);
          // Direct Supabase host often unreachable from Vercel serverless
          if (parsed.hostname.startsWith('db.') && parsed.hostname.endsWith('.supabase.co')) {
            throw new Error(
              'On Vercel, the direct Supabase URL (db.xxx.supabase.co) fails with ENOTFOUND. ' +
                'Set DATABASE_POOLER_URL in Vercel to the Connection pooler URL: Supabase → Project Settings → Database → Connection string → Transaction mode (port 6543, host aws-0-*.pooler.supabase.com). ' +
                'Add ?pgbouncer=true to the pooler URL. See DEPLOYMENT.md.'
            );
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('On Vercel')) throw e;
        }
      }
      url = directUrl;
    } else {
      throw new Error('DATABASE_URL is required for Postgres. On Vercel, set DATABASE_POOLER_URL (pooler URL, port 6543).');
    }

    const isServerless = Boolean(process.env.VERCEL);
    pgPool = new pg.Pool({
      connectionString: url,
      ...(isServerless && {
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 5000,
        max: 1,
      }),
    });
  }
  return pgPool;
}

// --- Supabase REST path (no pg / no pooler) ---
let supabaseDbClient: SupabaseClient | null = null;

function getSupabaseDb(): SupabaseClient {
  if (!supabaseDbClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('[db] Supabase REST: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      throw new Error(
        'USE_SUPABASE_DB=true requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ' +
          'You do not need DATABASE_URL or DATABASE_POOLER_URL when using Supabase REST for DB.'
      );
    }
    try {
      const parsed = new URL(url);
      console.log('[db] Supabase REST client initializing | host=', parsed.hostname);
    } catch {
      console.log('[db] Supabase REST client initializing');
    }
    supabaseDbClient = createClient(url, key);
  }
  return supabaseDbClient;
}

// --- Unified async db interface ---
export const db = {
  prepare(sql: string) {
    return {
      get: async (...params: unknown[]): Promise<Row | undefined> => {
        if (useSupabaseDb) {
          const { data, error } = await getSupabaseDb().rpc('run_sql_query', {
            query: toPgParams(sql),
            params: params.map(String),
          });
          if (error) {
            console.error('[db] Supabase REST run_sql_query error:', error.message, '| code=', error.code, '| details=', error.details);
            throw error;
          }
          const row = data != null && Array.isArray(data) ? data[0] : undefined;
          return row != null ? (row as Row) : undefined;
        }
        if (usePg) {
          const pool = await getPg();
          const r = await pool.query(toPgParams(sql), params);
          return r.rows[0] as Row | undefined;
        }
        return getSqlite().prepare(sql).get(...params) as Row | undefined;
      },
      all: async (...params: unknown[]): Promise<Row[]> => {
        if (useSupabaseDb) {
          const { data, error } = await getSupabaseDb().rpc('run_sql_query', {
            query: toPgParams(sql),
            params: params.map(String),
          });
          if (error) {
            console.error('[db] Supabase REST run_sql_query error:', error.message, '| code=', error.code, '| details=', error.details);
            throw error;
          }
          return Array.isArray(data) ? (data as Row[]) : [];
        }
        if (usePg) {
          const pool = await getPg();
          const r = await pool.query(toPgParams(sql), params);
          return r.rows as Row[];
        }
        return getSqlite().prepare(sql).all(...params) as Row[];
      },
      run: async (...params: unknown[]): Promise<void> => {
        if (useSupabaseDb) {
          const { error } = await getSupabaseDb().rpc('run_sql_exec', {
            query: toPgParams(sql),
            params: params.map(String),
          });
          if (error) {
            console.error('[db] Supabase REST run_sql_exec error:', error.message, '| code=', error.code, '| details=', error.details);
            throw error;
          }
          return;
        }
        if (usePg) {
          const pool = await getPg();
          await pool.query(toPgParams(sql), params);
          return;
        }
        getSqlite().prepare(sql).run(...params);
      },
    };
  },
};

export type SketchRow = {
  id: string;
  group_id: string | null;
  version: number;
  version_label: string | null;
  title: string;
  description: string | null;
  storage_key: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  bpm: number | null;
  duration_seconds: number | null;
  key: string | null;
  created_at: string;
  updated_at: string;
  collection_id?: string | null;
  tier_id?: string | null;
};

export type NoteRow = { id: string; sketch_id: string; type: 'timestamp' | 'general'; time_seconds: number | null; content: string; created_at: string };
export type ReferenceRow = { id: string; sketch_id: string; type: 'link' | 'sketch' | 'reference_audio'; url: string | null; target_sketch_id: string | null; reference_audio_id: string | null; label: string | null; created_at: string };
export type ShareTokenRow = { id: string; sketch_id: string; token: string; expires_at: string | null; created_at: string };
export type CollectionRow = { id: string; name: string; created_at: string | null; updated_at: string | null };
export type CollectionTierRow = { id: string; collection_id: string; label: string; sort_order: number; color: string | null };
export type SketchCollectionRow = { id: string; sketch_id: string; collection_id: string; tier_id: string | null; sort_order: number; created_at: string };
export type ActivityRow = { id: string; type: string; entity_type: string; entity_id: string | null; payload_json: string | null; created_at: string };
export type MelodyRow = { id: string; sketch_id: string; storage_key: string; file_name: string; mime_type: string; file_size_bytes: number; duration_seconds: number | null; bpm: number | null; label: string; color: string | null; offset_ms: number; sort_order: number; notes: string | null; created_at: string; updated_at: string };
export type TagRow = { id: string; name: string };
export type SketchTagRow = { sketch_id: string; tag_id: string };
