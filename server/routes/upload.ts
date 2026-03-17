import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import {
  saveFile,
  getAudioDurationFromBuffer,
  isAllowedMime,
  getExtension,
  MAX_FILE_SIZE,
  deleteFile,
  createSignedUploadUrl,
  getSupabaseBucket,
  getFileBuffer,
} from '../storage.js';
import { sketchRowToSketch, referenceAudioRowToApi } from '../map.js';
import { createActivity } from '../activities.js';
import { computePeaksFromBuffer } from '../peaks.js';
import type { SketchRow, NoteRow, ReferenceRow, MelodyRow } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const USE_SUPABASE_STORAGE = process.env.USE_SUPABASE_STORAGE === 'true';
const DIRECT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/** Compute peaks from stored file and update sketch (for direct-upload flow). Runs async; sets peaks_status to computing → ready | failed. */
async function computePeaksFromStorage(sketchId: string): Promise<void> {
  try {
    const row = await db.prepare('SELECT storage_key, duration_seconds FROM sketches WHERE id = ?').get(sketchId) as { storage_key: string; duration_seconds: number | null } | undefined;
    if (!row) return;
    await db.prepare('UPDATE sketches SET peaks_status = ?, updated_at = ? WHERE id = ?').run('computing', new Date().toISOString(), sketchId);
    const buffer = await getFileBuffer(row.storage_key);
    if (!buffer) {
      await db.prepare('UPDATE sketches SET peaks_status = ?, updated_at = ? WHERE id = ?').run('failed', new Date().toISOString(), sketchId);
      console.error('[upload] computePeaksFromStorage: no buffer for sketch', sketchId);
      return;
    }
    const durationHint = row.duration_seconds != null && row.duration_seconds > 0 ? row.duration_seconds : 60;
    const { peaks, srcDuration } = await computePeaksFromBuffer(buffer, durationHint, 256);
    const peaksJson = JSON.stringify(peaks);
    const updatedAt = new Date().toISOString();
    const needsDuration = row.duration_seconds == null || row.duration_seconds <= 0;
    if (needsDuration && srcDuration > 0) {
      await db.prepare('UPDATE sketches SET peaks_json = ?::jsonb, peaks_status = ?, duration_seconds = ?, updated_at = ? WHERE id = ?').run(peaksJson, 'ready', srcDuration, updatedAt, sketchId);
    } else {
      await db.prepare('UPDATE sketches SET peaks_json = ?::jsonb, peaks_status = ?, updated_at = ? WHERE id = ?').run(peaksJson, 'ready', updatedAt, sketchId);
    }
    console.log('[upload] computePeaksFromStorage done | id=', sketchId, 'bars=', peaks.length, 'srcDuration=', srcDuration);
  } catch (err) {
    console.error('[upload] computePeaksFromStorage failed | id=', sketchId, 'error=', err instanceof Error ? err.message : err);
    try {
      await db.prepare('UPDATE sketches SET peaks_status = ?, updated_at = ? WHERE id = ?').run('failed', new Date().toISOString(), sketchId);
    } catch (e) {
      console.error('[upload] computePeaksFromStorage: could not set status failed:', e);
    }
  }
}

/** POST /api/upload/sketch/upload-url — get signed URL for direct upload (no file in body). */
router.post('/sketch/upload-url', async (req: Request, res: Response) => {
  if (!USE_SUPABASE_STORAGE) {
    res.status(503).json({ error: 'Direct upload not available', code: 'USE_MULTIPART' });
    return;
  }
  const body = req.body as { fileName?: string; mimeType?: string; fileSizeBytes?: number; title?: string; description?: string; parentSketchId?: string };
  const { fileName, mimeType, fileSizeBytes, title, description, parentSketchId } = body;
  if (!fileName || !mimeType || fileSizeBytes == null) {
    res.status(400).json({ error: 'fileName, mimeType, and fileSizeBytes are required' });
    return;
  }
  if (!isAllowedMime(mimeType)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size < 0 || size > DIRECT_UPLOAD_MAX_BYTES) {
    res.status(400).json({ error: `fileSizeBytes must be 0–${DIRECT_UPLOAD_MAX_BYTES}` });
    return;
  }
  try {
    const id = uuidv4();
    const ext = getExtension(mimeType);
    const storageKey = `${id}${ext}`;
    const { path, token } = await createSignedUploadUrl(storageKey);
    const bucket = getSupabaseBucket();
    res.json({
      id,
      storageKey: path,
      token,
      bucket,
      supabaseUrl: process.env.SUPABASE_URL ?? undefined,
    });
  } catch (err) {
    console.error('[upload] sketch/upload-url error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create upload URL' });
  }
});

/** POST /api/upload/sketch/register — create sketch row after client uploaded file to storage. */
router.post('/sketch/register', async (req: Request, res: Response) => {
  const body = req.body as {
    id: string;
    storageKey: string;
    title: string;
    description?: string | null;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    durationSeconds?: number | null;
    bpm?: number | null;
    key?: string | null;
    parentSketchId?: string | null;
  };
  const { id, storageKey, title, description, fileName, mimeType, fileSizeBytes, durationSeconds, bpm, key, parentSketchId } = body;
  if (!id || !storageKey || title == null || title === '' || !fileName || !mimeType || fileSizeBytes == null) {
    res.status(400).json({ error: 'id, storageKey, title, fileName, mimeType, fileSizeBytes are required' });
    return;
  }
  if (!isAllowedMime(mimeType)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  try {
    let version = 1;
    let groupId: string | null = null;
    if (parentSketchId) {
      const parent = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(parentSketchId) as SketchRow | undefined;
      if (parent) {
        groupId = parent.group_id ?? parent.id;
        const maxVer = await db.prepare('SELECT MAX(version) as v FROM sketches WHERE group_id = ?').get(groupId) as { v: number };
        version = (maxVer?.v ?? 0) + 1;
      }
    }
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO sketches (id, group_id, version, title, description, storage_key, file_name, mime_type, file_size_bytes, bpm, duration_seconds, key, peaks_json, peaks_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?)`
    ).run(
      id,
      groupId || null,
      version,
      (title ?? '').trim() || fileName || 'Untitled',
      description || null,
      storageKey,
      fileName,
      mimeType,
      Number(fileSizeBytes),
      bpm != null ? Number(bpm) : null,
      durationSeconds != null ? Number(durationSeconds) : null,
      key != null && String(key).trim() ? String(key).trim() : null,
      now,
      now
    );
    const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow;
    const notes = await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(id) as NoteRow[];
    const refs = await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(id) as ReferenceRow[];
    await createActivity('upload', 'sketch', id, { sketchTitle: row.title });
    computePeaksFromStorage(id).catch(() => {});
    res.status(201).json(sketchRowToSketch(row, notes, refs));
  } catch (err) {
    console.error('[upload] sketch/register error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to register sketch' });
  }
});

/** POST /api/upload/sketch/replace/:id/upload-url — signed URL for replace (direct upload). */
router.post('/sketch/replace/:id/upload-url', async (req: Request, res: Response) => {
  const sketchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
  if (!USE_SUPABASE_STORAGE) {
    res.status(503).json({ error: 'Direct upload not available', code: 'USE_MULTIPART' });
    return;
  }
  const existing = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(sketchId) as SketchRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const body = req.body as { fileName?: string; mimeType?: string; fileSizeBytes?: number };
  const { fileName, mimeType, fileSizeBytes } = body;
  if (!fileName || !mimeType || fileSizeBytes == null) {
    res.status(400).json({ error: 'fileName, mimeType, and fileSizeBytes are required' });
    return;
  }
  if (!isAllowedMime(mimeType)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size < 0 || size > DIRECT_UPLOAD_MAX_BYTES) {
    res.status(400).json({ error: `fileSizeBytes must be 0–${DIRECT_UPLOAD_MAX_BYTES}` });
    return;
  }
  try {
    const ext = getExtension(mimeType);
    const storageKey = `${uuidv4()}${ext}`;
    const { path, token } = await createSignedUploadUrl(storageKey);
    const bucket = getSupabaseBucket();
    res.json({ storageKey: path, token, bucket, supabaseUrl: process.env.SUPABASE_URL ?? undefined });
  } catch (err) {
    console.error('[upload] sketch/replace/upload-url error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create upload URL' });
  }
});

/** POST /api/upload/sketch/replace/:id/register — update sketch after client uploaded replacement file. */
router.post('/sketch/replace/:id/register', async (req: Request, res: Response) => {
  const sketchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
  const existing = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(sketchId) as SketchRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const body = req.body as { storageKey: string; fileName: string; mimeType: string; fileSizeBytes: number; durationSeconds?: number | null };
  const { storageKey, fileName, mimeType, fileSizeBytes, durationSeconds } = body;
  if (!storageKey || !fileName || !mimeType || fileSizeBytes == null) {
    res.status(400).json({ error: 'storageKey, fileName, mimeType, fileSizeBytes are required' });
    return;
  }
  if (!isAllowedMime(mimeType)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  try {
    deleteFile(existing.storage_key);
    const now = new Date().toISOString();
    await db.prepare(
      `UPDATE sketches SET storage_key = ?, file_name = ?, mime_type = ?, file_size_bytes = ?, duration_seconds = ?, peaks_json = NULL, peaks_status = ?, updated_at = ? WHERE id = ?`
    ).run(
      storageKey,
      fileName,
      mimeType,
      Number(fileSizeBytes),
      durationSeconds != null ? Number(durationSeconds) : null,
      'pending',
      now,
      sketchId
    );
    const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(sketchId) as SketchRow;
    const notes = await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(sketchId) as NoteRow[];
    const refs = await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(sketchId) as ReferenceRow[];
    await createActivity('replace', 'sketch', sketchId, { sketchTitle: row.title });
    computePeaksFromStorage(sketchId).catch(() => {});
    res.json(sketchRowToSketch(row, notes, refs));
  } catch (err) {
    console.error('[upload] sketch/replace/register error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to register replace' });
  }
});

router.post('/sketch', upload.single('file'), async (req: Request, res: Response) => {
  try {
  console.log('[upload] POST /sketch reached | hasFile=', !!req.file, '| contentType=', req.headers['content-type']);
  if (!req.file) {
    console.log('[upload] POST /sketch rejected: no file in request');
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  console.log('[upload] POST /sketch file received | size=', req.file.size, '| mime=', req.file.mimetype);
  if (!isAllowedMime(req.file.mimetype)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  const { title, description, bpm, key, parentSketchId } = req.body as Record<string, string | undefined>;
  const id = uuidv4();
  const ext = getExtension(req.file.mimetype);
  let durationSeconds: number | undefined;
  try {
    durationSeconds = await getAudioDurationFromBuffer(req.file.buffer, req.file.mimetype);
  } catch (e) {
    console.error('[upload] getAudioDurationFromBuffer error:', e);
  }
  console.log('[upload] POST /sketch saving to storage (key=', id + ext, ')');
  let storageKey: string;
  try {
    storageKey = await saveFile(req.file.buffer, ext, req.file.mimetype);
  } catch (e) {
    console.error('[upload] saveFile error:', e);
    throw e;
  }
  console.log('[upload] POST /sketch storage saved | storageKey=', storageKey);
  let version = 1;
  let groupId: string | null = null;
  if (parentSketchId) {
    const parent = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(parentSketchId) as SketchRow | undefined;
    if (parent) {
      groupId = parent.group_id ?? parent.id;
      const maxVer = await db.prepare('SELECT MAX(version) as v FROM sketches WHERE group_id = ?').get(groupId) as { v: number };
      version = (maxVer?.v ?? 0) + 1;
    }
  }
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO sketches (id, group_id, version, title, description, storage_key, file_name, mime_type, file_size_bytes, bpm, duration_seconds, key, peaks_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    groupId || null,
    version,
    title?.trim() || req.file.originalname || 'Untitled',
    description || null,
    storageKey,
    req.file.originalname || `audio${ext}`,
    req.file.mimetype,
    req.file.size,
    bpm ? Number(bpm) : null,
    durationSeconds ?? null,
    key?.trim() || null,
    now,
    now
  );
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow;
  const notes = await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(id) as NoteRow[];
  const refs = await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(id) as ReferenceRow[];
  await createActivity('upload', 'sketch', id, { sketchTitle: row.title });

  const durationForPeaks = durationSeconds ?? 60;
  console.log('[upload] POST /sketch computing peaks | id=', id, 'duration=', durationForPeaks);
  try {
    const { peaks } = await computePeaksFromBuffer(req.file.buffer, durationForPeaks, 256);
    const peaksJson = JSON.stringify(peaks);
    const updatedAt = new Date().toISOString();
    await db.prepare('UPDATE sketches SET peaks_json = ?::jsonb, peaks_status = ?, updated_at = ? WHERE id = ?').run(peaksJson, 'ready', updatedAt, id);
    console.log('[upload] POST /sketch peaks saved | id=', id, 'bars=', peaks.length);
  } catch (err) {
    console.error('[upload] POST /sketch peaks compute/save failed | id=', id, 'error=', err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '');
    await db.prepare('UPDATE sketches SET peaks_status = ?, updated_at = ? WHERE id = ?').run('failed', new Date().toISOString(), id).catch(() => {});
  }

  console.log('[upload] POST /sketch success | id=', id);
  res.status(201).json(sketchRowToSketch(row, notes, refs));
} catch (err) {
  console.error('[upload] POST /sketch error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }
}
});

router.post('/sketch/replace/:id', upload.single('file'), async (req: Request, res: Response) => {
  const sketchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';
  const existing = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(sketchId) as SketchRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  if (!isAllowedMime(req.file.mimetype)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  deleteFile(existing.storage_key);
  const ext = getExtension(req.file.mimetype);
  const durationSeconds = await getAudioDurationFromBuffer(req.file.buffer, req.file.mimetype);
  const storageKey = await saveFile(req.file.buffer, ext, req.file.mimetype);
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE sketches SET storage_key = ?, file_name = ?, mime_type = ?, file_size_bytes = ?, duration_seconds = ?, peaks_json = NULL, updated_at = ? WHERE id = ?`
  ).run(
    storageKey,
    req.file.originalname || `audio${ext}`,
    req.file.mimetype,
    req.file.size,
    durationSeconds ?? null,
    now,
    sketchId
  );
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(sketchId) as SketchRow;
  const notes = await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(sketchId) as NoteRow[];
  const refs = await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(sketchId) as ReferenceRow[];
  await createActivity('replace', 'sketch', sketchId, { sketchTitle: row.title });

  const durationForPeaks = durationSeconds ?? 60;
  console.log('[upload] POST /sketch/replace computing peaks | id=', sketchId, 'duration=', durationForPeaks);
  try {
    const { peaks } = await computePeaksFromBuffer(req.file.buffer, durationForPeaks, 256);
    const peaksJson = JSON.stringify(peaks);
    const updatedAt = new Date().toISOString();
    await db.prepare('UPDATE sketches SET peaks_json = ?::jsonb, peaks_status = ?, updated_at = ? WHERE id = ?').run(peaksJson, 'ready', updatedAt, sketchId);
    console.log('[upload] POST /sketch/replace peaks saved | id=', sketchId, 'bars=', peaks.length);
  } catch (err) {
    console.error('[upload] POST /sketch/replace peaks compute/save failed | id=', sketchId, 'error=', err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '');
    await db.prepare('UPDATE sketches SET peaks_status = ?, updated_at = ? WHERE id = ?').run('failed', new Date().toISOString(), sketchId).catch(() => {});
  }

  res.json(sketchRowToSketch(row, notes, refs));
});

/** Compute peaks from stored file and update melody (for direct-upload flow). */
async function computeMelodyPeaksFromStorage(melodyId: string): Promise<void> {
  try {
    const row = await db.prepare('SELECT storage_key, duration_seconds FROM melodies WHERE id = ?').get(melodyId) as { storage_key: string; duration_seconds: number | null } | undefined;
    if (!row) return;
    const buffer = await getFileBuffer(row.storage_key);
    if (!buffer) {
      console.error('[upload] computeMelodyPeaksFromStorage: no buffer for melody', melodyId);
      return;
    }
    const durationHint = row.duration_seconds != null && row.duration_seconds > 0 ? row.duration_seconds : 60;
    const { peaks, srcDuration } = await computePeaksFromBuffer(buffer, durationHint, 256);
    const peaksJson = JSON.stringify(peaks);
    const updatedAt = new Date().toISOString();
    const needsDuration = row.duration_seconds == null || row.duration_seconds <= 0;
    if (needsDuration && srcDuration > 0) {
      await db.prepare('UPDATE melodies SET peaks_json = ?::jsonb, duration_seconds = ?, updated_at = ? WHERE id = ?').run(peaksJson, srcDuration, updatedAt, melodyId);
    } else {
      await db.prepare('UPDATE melodies SET peaks_json = ?::jsonb, updated_at = ? WHERE id = ?').run(peaksJson, updatedAt, melodyId);
    }
    console.log('[upload] computeMelodyPeaksFromStorage done | id=', melodyId, 'bars=', peaks.length, 'srcDuration=', srcDuration);
  } catch (err) {
    console.error('[upload] computeMelodyPeaksFromStorage failed | id=', melodyId, 'error=', err instanceof Error ? err.message : err);
  }
}

/** POST /api/upload/melody/upload-url — get signed URL for direct melody upload. */
router.post('/melody/upload-url', async (req: Request, res: Response) => {
  if (!USE_SUPABASE_STORAGE) {
    res.status(503).json({ error: 'Direct upload not available', code: 'USE_MULTIPART' });
    return;
  }
  const body = req.body as { sketchId: string; fileName: string; mimeType: string; fileSizeBytes: number; label?: string; color?: string | null; offsetMs?: number };
  const { sketchId, fileName, mimeType, fileSizeBytes } = body;
  if (!sketchId || !fileName || !mimeType || fileSizeBytes == null) {
    res.status(400).json({ error: 'sketchId, fileName, mimeType, and fileSizeBytes are required' });
    return;
  }
  const sketch = await db.prepare('SELECT id FROM sketches WHERE id = ?').get(sketchId);
  if (!sketch) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  if (!isAllowedMime(mimeType)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size < 0 || size > DIRECT_UPLOAD_MAX_BYTES) {
    res.status(400).json({ error: `fileSizeBytes must be 0–${DIRECT_UPLOAD_MAX_BYTES}` });
    return;
  }
  try {
    const id = uuidv4();
    const ext = getExtension(mimeType);
    const storageKey = `${id}${ext}`;
    const { path, token } = await createSignedUploadUrl(storageKey);
    const bucket = getSupabaseBucket();
    res.json({
      id,
      storageKey: path,
      token,
      bucket,
      supabaseUrl: process.env.SUPABASE_URL ?? undefined,
    });
  } catch (err) {
    console.error('[upload] melody/upload-url error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create upload URL' });
  }
});

/** POST /api/upload/melody/register — create melody row after client uploaded file. */
router.post('/melody/register', async (req: Request, res: Response) => {
  const body = req.body as {
    id: string;
    sketchId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    durationSeconds?: number | null;
    label?: string | null;
    color?: string | null;
    offsetMs?: number | null;
    notes?: string | null;
  };
  const { id, sketchId, storageKey, fileName, mimeType, fileSizeBytes, durationSeconds, label, color, offsetMs, notes } = body;
  if (!id || !sketchId || !storageKey || !fileName || !mimeType || fileSizeBytes == null) {
    res.status(400).json({ error: 'id, sketchId, storageKey, fileName, mimeType, fileSizeBytes are required' });
    return;
  }
  const sketch = await db.prepare('SELECT id FROM sketches WHERE id = ?').get(sketchId);
  if (!sketch) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  if (!isAllowedMime(mimeType)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  try {
    const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM melodies WHERE sketch_id = ?').get(sketchId) as { next: number };
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO melodies (id, sketch_id, storage_key, file_name, mime_type, file_size_bytes, duration_seconds, bpm, label, color, offset_ms, sort_order, notes, peaks_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      id,
      sketchId,
      storageKey,
      fileName,
      mimeType,
      fileSizeBytes,
      durationSeconds ?? null,
      (label ?? '').trim() || fileName,
      color ?? null,
      offsetMs != null ? Number(offsetMs) : 0,
      maxOrder.next,
      notes ?? null,
      now,
      now
    );
    const row = await db.prepare('SELECT * FROM melodies WHERE id = ?').get(id) as MelodyRow;
    computeMelodyPeaksFromStorage(id).catch(() => {});
    res.status(201).json(melodyRowToApi(row));
  } catch (err) {
    console.error('[upload] melody/register error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to register melody' });
  }
});

function melodyRowToApi(row: MelodyRow) {
  return {
    id: row.id,
    sketchId: row.sketch_id,
    storageKey: row.storage_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    durationSeconds: row.duration_seconds ?? undefined,
    bpm: row.bpm ?? undefined,
    label: row.label,
    color: row.color,
    offsetMs: row.offset_ms,
    sortOrder: row.sort_order,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.post('/reference', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  if (!isAllowedMime(req.file.mimetype)) {
    res.status(400).json({ error: 'Invalid file type. Audio files only.' });
    return;
  }
  const id = uuidv4();
  const ext = getExtension(req.file.mimetype);
  const storageKey = await saveFile(req.file.buffer, ext, req.file.mimetype);
  const { label } = req.body as Record<string, string | undefined>;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO reference_audio (id, storage_key, file_name, mime_type, file_size_bytes, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, storageKey, req.file.originalname || `ref${ext}`, req.file.mimetype, req.file.size, label || null, now);
  await createActivity('upload', 'reference_audio', id, { label: label || undefined });
  const row = await db.prepare('SELECT * FROM reference_audio WHERE id = ?').get(id) as {
    id: string;
    storage_key: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    label: string | null;
    created_at: string;
  };
  res.status(201).json(referenceAudioRowToApi(row));
});

export default router;
