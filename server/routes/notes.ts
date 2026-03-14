import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import type { NoteRow } from '../db.js';

const router = Router();

router.get('/sketch/:sketchId', (req: Request, res: Response) => {
  const notes = db.prepare('SELECT * FROM notes WHERE sketch_id = ? ORDER BY created_at').all(req.params.sketchId) as NoteRow[];
  res.json(notes.map((r) => ({
    id: r.id,
    sketchId: r.sketch_id,
    type: r.type,
    timeSeconds: r.time_seconds ?? undefined,
    content: r.content,
    createdAt: r.created_at,
  })));
});

router.post('/sketch/:sketchId', (req: Request, res: Response) => {
  const sketchId = req.params.sketchId;
  const sketch = db.prepare('SELECT id FROM sketches WHERE id = ?').get(sketchId);
  if (!sketch) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const { type, content, timeSeconds } = req.body as { type: 'timestamp' | 'general'; content: string; timeSeconds?: number };
  if (!type || !content || (type !== 'timestamp' && type !== 'general')) {
    res.status(400).json({ error: 'type and content required; type must be timestamp or general' });
    return;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notes (id, sketch_id, type, time_seconds, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, sketchId, type, type === 'timestamp' && timeSeconds != null ? timeSeconds : null, content, now);
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow;
  res.status(201).json({
    id: row.id,
    sketchId: row.sketch_id,
    type: row.type,
    timeSeconds: row.time_seconds ?? undefined,
    content: row.content,
    createdAt: row.created_at,
  });
});

router.patch('/:id', (req: Request, res: Response) => {
  const { content, timeSeconds } = req.body as { content?: string; timeSeconds?: number };
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  if (content !== undefined) {
    db.prepare('UPDATE notes SET content = ? WHERE id = ?').run(content, id);
  }
  if (timeSeconds !== undefined && row.type === 'timestamp') {
    db.prepare('UPDATE notes SET time_seconds = ? WHERE id = ?').run(timeSeconds, id);
  }
  const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow;
  res.json({
    id: updated.id,
    sketchId: updated.sketch_id,
    type: updated.type,
    timeSeconds: updated.time_seconds ?? undefined,
    content: updated.content,
    createdAt: updated.created_at,
  });
});

router.delete('/:id', (req: Request, res: Response) => {
  const r = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  if (r.changes === 0) res.status(404).json({ error: 'Note not found' });
  else res.status(204).send();
});

export default router;
