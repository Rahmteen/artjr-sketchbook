import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { getFileStream, deleteFile } from '../storage.js';
import { referenceAudioRowToApi } from '../map.js';
import { createActivity } from '../activities.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM reference_audio ORDER BY created_at DESC').all() as Array<{
    id: string;
    storage_key: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    label: string | null;
    created_at: string;
  }>;
  res.json(rows.map(referenceAudioRowToApi));
});

router.get('/:id/audio', async (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM reference_audio WHERE id = ?').get(req.params.id) as {
    storage_key: string;
    mime_type: string;
  } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Reference audio not found' });
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

router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM reference_audio WHERE id = ?').get(id) as { storage_key: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Reference audio not found' });
    return;
  }
  db.prepare('DELETE FROM sketch_references WHERE reference_audio_id = ?').run(id);
  deleteFile(row.storage_key);
  createActivity('delete', 'reference_audio', id, {});
  db.prepare('DELETE FROM reference_audio WHERE id = ?').run(id);
  res.status(204).send();
});

export default router;
