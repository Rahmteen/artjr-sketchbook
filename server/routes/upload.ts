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
} from '../storage.js';
import { sketchRowToSketch, referenceAudioRowToApi } from '../map.js';
import { createActivity } from '../activities.js';
import type { SketchRow, NoteRow, ReferenceRow } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
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
    `INSERT INTO sketches (id, group_id, version, title, description, storage_key, file_name, mime_type, file_size_bytes, bpm, duration_seconds, key, created_at, updated_at)
     VALUES ($1, NULLIF($2, 'null'), $3::integer, $4, NULLIF($5, 'null'), $6, $7, $8, $9::integer, NULLIF($10, 'null')::real, NULLIF($11, 'null')::real, NULLIF($12, 'null'), $13, $14)`
  ).run(
    id,
    groupId,
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
    `UPDATE sketches SET storage_key = ?, file_name = ?, mime_type = ?, file_size_bytes = ?, duration_seconds = ?, updated_at = ? WHERE id = ?`
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
  res.json(sketchRowToSketch(row, notes, refs));
});

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
