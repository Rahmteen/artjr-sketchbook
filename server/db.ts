import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** One-time log at cold start (no secrets). */
let dbModeLogged = false;
function logDbMode(): void {
  if (dbModeLogged) return;
  dbModeLogged = true;
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('[db] mode= supabase-rest | SUPABASE_URL set=', hasSupabaseUrl, '| SUPABASE_SERVICE_ROLE_KEY set=', hasServiceRoleKey);
}
logDbMode();

/** Convert ? placeholders to $1, $2 for Postgres. */
function toPgParams(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Row = Record<string, unknown>;

let supabaseDbClient: SupabaseClient | null = null;

function getSupabaseDb(): SupabaseClient {
  if (!supabaseDbClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the database. Set them in .env or your deployment environment.'
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

export const db = {
  prepare(sql: string) {
    return {
      get: async (...params: unknown[]): Promise<Row | undefined> => {
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
      },
      all: async (...params: unknown[]): Promise<Row[]> => {
        const { data, error } = await getSupabaseDb().rpc('run_sql_query', {
          query: toPgParams(sql),
          params: params.map(String),
        });
        if (error) {
          console.error('[db] Supabase REST run_sql_query error:', error.message, '| code=', error.code, '| details=', error.details);
          throw error;
        }
        return Array.isArray(data) ? (data as Row[]) : [];
      },
      run: async (...params: unknown[]): Promise<void> => {
        const { error } = await getSupabaseDb().rpc('run_sql_exec', {
          query: toPgParams(sql),
          params: params.map(String),
        });
        if (error) {
          console.error('[db] Supabase REST run_sql_exec error:', error.message, '| code=', error.code, '| details=', error.details);
          throw error;
        }
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
