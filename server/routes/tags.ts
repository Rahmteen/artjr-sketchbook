import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { createActivity } from '../activities.js';
import type { TagRow } from '../db.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM tags ORDER BY name ASC').all() as TagRow[];
  res.json(rows.map((r) => ({ id: r.id, name: r.name })));
});

router.post('/', (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const trimmed = name.trim();
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(trimmed) as TagRow | undefined;
  if (existing) {
    res.json({ id: existing.id, name: existing.name });
    return;
  }
  const id = uuidv4();
  db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, trimmed);
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow;
  res.status(201).json({ id: row.id, name: row.name });
});

router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id) as TagRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Tag not found' });
    return;
  }
  res.json({ id: row.id, name: row.name });
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Tag not found' });
    return;
  }
  db.prepare('DELETE FROM sketch_tags WHERE tag_id = ?').run(id);
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  res.status(204).send();
});

export default router;
