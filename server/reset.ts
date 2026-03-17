import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'audio';
const supabase = createClient(url, key);

async function exec(sql: string) {
  const { error } = await supabase.rpc('run_sql_exec', { query: sql, params: [] });
  if (error) throw new Error(`SQL failed: ${error.message}\n  ${sql}`);
}

async function clearStorage() {
  const { data: files, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) { console.warn('Could not list storage:', error.message); return; }
  if (!files || files.length === 0) { console.log('Storage bucket already empty.'); return; }

  const paths = files.map((f) => f.name);
  const { error: delErr } = await supabase.storage.from(bucket).remove(paths);
  if (delErr) console.warn('Storage delete error:', delErr.message);
  else console.log(`Deleted ${paths.length} file(s) from storage bucket "${bucket}".`);
}

async function main() {
  console.log('Clearing all data...\n');

  // Delete in FK-safe order (children first)
  const tables = [
    'sketch_tags',
    'melodies',
    'sketch_collections',
    'collection_tiers',
    'collections',
    'share_tokens',
    'sketch_references',
    'notes',
    'activities',
    'reference_audio',
    'tags',
    'sketches',
  ];

  for (const t of tables) {
    await exec(`DELETE FROM ${t} WHERE true`);
    console.log(`  ✓ ${t}`);
  }

  await clearStorage();

  console.log('\nDone — all data cleared.');
}

main().catch((err) => { console.error(err); process.exit(1); });
