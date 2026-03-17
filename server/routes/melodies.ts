import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import {
  saveFile,
  getAudioDurationFromBuffer,
  isAllowedMime,
  getExtension,
  getFileStream,
  deleteFile,
  MAX_FILE_SIZE,
} from '../storage.js';
import { computePeaksFromBuffer } from '../peaks.js';
import { strParam } from '../param.js';
import type { MelodyRow } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
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

router.get('/sketch/:sketchId', async (req: Request, res: Response) => {
  const sketchId = strParam(req.params.sketchId);
  const sketch = await db.prepare('SELECT id FROM sketches WHERE id = ?').get(sketchId);
  if (!sketch) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const rows = (await db
    .prepare('SELECT * FROM melodies WHERE sketch_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(sketchId)) as MelodyRow[];
  res.json(rows.map(melodyRowToApi));
});

router.post('/upload/:sketchId', upload.single('file'), async (req: Request, res: Response) => {
  const sketchId = strParam(req.params.sketchId);
  const sketch = await db.prepare('SELECT id FROM sketches WHERE id = ?').get(sketchId);
  if (!sketch) {
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

  const { label, color, offsetMs, notes } = req.body as Record<string, string | undefined>;
  const id = uuidv4();
  const ext = getExtension(req.file.mimetype);
  const durationSeconds = await getAudioDurationFromBuffer(req.file.buffer, req.file.mimetype);
  const storageKey = await saveFile(req.file.buffer, ext, req.file.mimetype);
  const now = new Date().toISOString();
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM melodies WHERE sketch_id = ?').get(sketchId) as { next: number };

  // Use explicit casts so Supabase RPC (params as text[]) matches column types
  await db.prepare(
    `INSERT INTO melodies (id, sketch_id, storage_key, file_name, mime_type, file_size_bytes, duration_seconds, bpm, label, color, offset_ms, sort_order, notes, peaks_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    sketchId,
    storageKey,
    req.file.originalname,
    req.file.mimetype,
    req.file.size,
    durationSeconds ?? null,
    label?.trim() || req.file.originalname,
    color ?? null,
    parseFloat(offsetMs ?? '0') || 0,
    maxOrder.next,
    notes?.trim() || null,
    now,
    now
  );

  const row = await db.prepare('SELECT * FROM melodies WHERE id = ?').get(id) as MelodyRow;
  res.status(201).json(melodyRowToApi(row));

  // Precompute waveform peaks and store in DB (non-blocking for upload response)
  const durationForPeaks = durationSeconds ?? 60;
  computePeaksFromBuffer(req.file.buffer, durationForPeaks, 256)
    .then(({ peaks }) => {
      const peaksJson = JSON.stringify(peaks);
      const updatedAt = new Date().toISOString();
      return db.prepare('UPDATE melodies SET peaks_json = ?::jsonb, updated_at = ? WHERE id = ?').run(peaksJson, updatedAt, id);
    })
    .catch((err) => console.error('[melodies] peaks compute/save failed:', err));
});

router.get('/:id/audio', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM melodies WHERE id = ?').get(id) as MelodyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Melody not found' });
    return;
  }
  const stream = await getFileStream(row.storage_key);
  if (!stream) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Type', row.mime_type);
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
  });
});

router.get('/:id/peaks', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT peaks_json FROM melodies WHERE id = ?').get(id) as { peaks_json: number[] | null } | undefined;
  if (!row || row.peaks_json == null) {
    res.status(404).json({ error: 'Peaks not found' });
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.json(row.peaks_json);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM melodies WHERE id = ?').get(id) as MelodyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Melody not found' });
    return;
  }
  const { label, color, offsetMs, sortOrder, notes } = req.body as {
    label?: string;
    color?: string | null;
    offsetMs?: number;
    sortOrder?: number;
    notes?: string | null;
  };

  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof label === 'string') { updates.push('label = ?'); values.push(label.trim()); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color); }
  if (typeof offsetMs === 'number') { updates.push('offset_ms = ?'); values.push(offsetMs); }
  if (typeof sortOrder === 'number') { updates.push('sort_order = ?'); values.push(sortOrder); }
  if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    await db.prepare(`UPDATE melodies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = await db.prepare('SELECT * FROM melodies WHERE id = ?').get(id) as MelodyRow;
  res.json(melodyRowToApi(updated));
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM melodies WHERE id = ?').get(id) as MelodyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Melody not found' });
    return;
  }
  deleteFile(row.storage_key);
  await db.prepare('DELETE FROM melodies WHERE id = ?').run(id);
  res.status(204).send();
});

export default router;
