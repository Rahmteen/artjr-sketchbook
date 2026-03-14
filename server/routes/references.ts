import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import type { ReferenceRow } from '../db.js';

const router = Router();

router.get('/sketch/:sketchId', (req: Request, res: Response) => {
  const refs = db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ? ORDER BY created_at').all(req.params.sketchId) as ReferenceRow[];
  res.json(refs.map((r) => ({
    id: r.id,
    sketchId: r.sketch_id,
    type: r.type,
    url: r.url ?? undefined,
    targetSketchId: r.target_sketch_id ?? undefined,
    referenceAudioId: r.reference_audio_id ?? undefined,
    label: r.label ?? undefined,
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
  const { type, url, targetSketchId, referenceAudioId, label } = req.body as {
    type: 'link' | 'sketch' | 'reference_audio';
    url?: string;
    targetSketchId?: string;
    referenceAudioId?: string;
    label?: string;
  };
  if (!type || !['link', 'sketch', 'reference_audio'].includes(type)) {
    res.status(400).json({ error: 'type must be link, sketch, or reference_audio' });
    return;
  }
  if (type === 'link' && !url) {
    res.status(400).json({ error: 'url required for link reference' });
    return;
  }
  if (type === 'sketch' && !targetSketchId) {
    res.status(400).json({ error: 'targetSketchId required for sketch reference' });
    return;
  }
  if (type === 'reference_audio' && !referenceAudioId) {
    res.status(400).json({ error: 'referenceAudioId required for reference_audio reference' });
    return;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sketch_references (id, sketch_id, type, url, target_sketch_id, reference_audio_id, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sketchId,
    type,
    type === 'link' ? url : null,
    type === 'sketch' ? targetSketchId : null,
    type === 'reference_audio' ? referenceAudioId : null,
    label || null,
    now
  );
  const row = db.prepare('SELECT * FROM sketch_references WHERE id = ?').get(id) as ReferenceRow;
  res.status(201).json({
    id: row.id,
    sketchId: row.sketch_id,
    type: row.type,
    url: row.url ?? undefined,
    targetSketchId: row.target_sketch_id ?? undefined,
    referenceAudioId: row.reference_audio_id ?? undefined,
    label: row.label ?? undefined,
    createdAt: row.created_at,
  });
});

router.delete('/:id', (req: Request, res: Response) => {
  const r = db.prepare('DELETE FROM sketch_references WHERE id = ?').run(req.params.id);
  if (r.changes === 0) res.status(404).json({ error: 'Reference not found' });
  else res.status(204).send();
});

export default router;
