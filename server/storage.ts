import { join } from 'path';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { parseFile, parseBuffer } from 'music-metadata';
import { v4 as uuidv4 } from 'uuid';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const USE_SUPABASE_STORAGE = process.env.USE_SUPABASE_STORAGE === 'true';
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'audio';

let supabase: SupabaseClient | null = null;
if (USE_SUPABASE_STORAGE) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    supabase = createClient(url, key);
  }
}

const AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
]);

function ensureUploadDir(): string {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  return UPLOAD_DIR;
}

export function getStoragePath(storageKey: string): string {
  return join(UPLOAD_DIR, storageKey);
}

/** Save file to disk (local) or Supabase bucket. Returns storageKey. */
export function saveFile(buffer: Buffer, extension: string, mimeType?: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const storageKey = `${uuidv4()}${ext}`;

  if (supabase) {
    const contentType = mimeType ?? 'application/octet-stream';
    const { error } = supabase.storage.from(SUPABASE_BUCKET).upload(storageKey, buffer, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return storageKey;
  }

  ensureUploadDir();
  const path = join(UPLOAD_DIR, storageKey);
  writeFileSync(path, buffer);
  return storageKey;
}

export function deleteFile(storageKey: string): void {
  if (supabase) {
    supabase.storage.from(SUPABASE_BUCKET).remove([storageKey]).then(({ error }) => {
      if (error) console.error('Storage delete failed:', error.message);
    });
    return;
  }
  const path = getStoragePath(storageKey);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function fileExists(storageKey: string): boolean {
  if (supabase) {
    return true;
  }
  return existsSync(getStoragePath(storageKey));
}

/** Get a readable stream of the file for piping to response. */
export async function getFileStream(storageKey: string): Promise<Readable | null> {
  if (supabase) {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(storageKey, 3600);
    if (error || !data?.signedUrl) return null;
    const response = await fetch(data.signedUrl);
    if (!response.ok || !response.body) return null;
    return Readable.fromWeb(response.body as import('stream').WebReadableStream);
  }
  const path = getStoragePath(storageKey);
  if (!existsSync(path)) return null;
  return createReadStream(path);
}

/** Get audio duration from a file path (local only). */
export async function getAudioDurationSeconds(filePath: string): Promise<number | undefined> {
  try {
    const metadata = await parseFile(filePath, { duration: true });
    return metadata.format.duration;
  } catch {
    return undefined;
  }
}

/** Get audio duration from an in-memory buffer (use when file is in bucket or before saving). */
export async function getAudioDurationFromBuffer(buffer: Buffer, mimeType?: string): Promise<number | undefined> {
  try {
    const metadata = await parseBuffer(new Uint8Array(buffer), mimeType ? { mimeType } : undefined);
    return metadata.format.duration;
  } catch {
    return undefined;
  }
}

export function isAllowedMime(mime: string): boolean {
  return AUDIO_MIMES.has(mime) || mime.startsWith('audio/');
}

export function getExtension(mime: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/wave': '.wav',
    'audio/x-wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
  };
  return map[mime] ?? '.bin';
}

export { MAX_FILE_SIZE };
