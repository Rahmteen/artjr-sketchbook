import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { sketchRowToSketch } from '../map.js';
import type { SketchRow, NoteRow, ReferenceRow } from '../db.js';

const router = Router();

router.post('/sketch/:sketchId', (req: Request, res: Response) => {
  const sketchId = req.params.sketchId;
  const sketch = db.prepare('SELECT id FROM sketches WHERE id = ?').get(sketchId);
  if (!sketch) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const { expiresInHours } = req.body as { expiresInHours?: number };
  const token = uuidv4();
  const id = uuidv4();
  const now = new Date();
  const expiresAt = expiresInHours
    ? new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null;
  db.prepare(
    `INSERT INTO share_tokens (id, sketch_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, sketchId, token, expiresAt, now.toISOString());
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.status(201).json({
    id,
    sketchId,
    token,
    expiresAt: expiresAt ?? undefined,
    createdAt: now.toISOString(),
    shareUrl: `${baseUrl}/s/${token}`,
  });
});

router.get('/resolve/:token', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM share_tokens WHERE token = ?').get(req.params.token) as {
    sketch_id: string;
    expires_at: string | null;
  } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Share link not found or expired' });
    return;
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM share_tokens WHERE token = ?').run(req.params.token);
    res.status(404).json({ error: 'Share link expired' });
    return;
  }
  const sketchRow = db.prepare('SELECT * FROM sketches WHERE id = ?').get(row.sketch_id) as SketchRow | undefined;
  if (!sketchRow) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const notes = db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(sketchRow.id) as NoteRow[];
  const refs = db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(sketchRow.id) as ReferenceRow[];
  res.json(sketchRowToSketch(sketchRow, notes, refs));
});

export default router;
