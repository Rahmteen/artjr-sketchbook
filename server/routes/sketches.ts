import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import { getFileStream, deleteFile } from '../storage.js';
import { sketchRowToSketch } from '../map.js';
import type { ApiSketchCollection } from '../map.js';
import { createActivity } from '../activities.js';
import { strParam } from '../param.js';
import type { SketchRow, NoteRow, ReferenceRow, SketchTagRow, TagRow } from '../db.js';

const router = Router();

async function getTagsForSketches(sketchIds: string[]): Promise<Map<string, { id: string; name: string }[]>> {
  if (!sketchIds.length) return new Map();
  const rows = (await db
    .prepare(
      `SELECT st.sketch_id, t.id, t.name FROM sketch_tags st JOIN tags t ON t.id = st.tag_id WHERE st.sketch_id IN (${sketchIds.map(() => '?').join(',')})`
    )
    .all(...sketchIds)) as (SketchTagRow & TagRow)[];
  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const list = map.get(r.sketch_id) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.sketch_id, list);
  }
  return map;
}

async function getCollectionsForSketches(sketchIds: string[]): Promise<Map<string, ApiSketchCollection[]>> {
  if (!sketchIds.length) return new Map();
  const rows = (await db.prepare(
    `SELECT sc.sketch_id, sc.collection_id, c.name as collection_name, sc.tier_id, ct.label as tier_label
     FROM sketch_collections sc
     JOIN collections c ON c.id = sc.collection_id
     LEFT JOIN collection_tiers ct ON ct.id = sc.tier_id
     WHERE sc.sketch_id IN (${sketchIds.map(() => '?').join(',')})`
  ).all(...sketchIds)) as { sketch_id: string; collection_id: string; collection_name: string; tier_id: string | null; tier_label: string | null }[];
  const map = new Map<string, ApiSketchCollection[]>();
  for (const r of rows) {
    const list = map.get(r.sketch_id) ?? [];
    list.push({ collectionId: r.collection_id, collectionName: r.collection_name, tierId: r.tier_id, tierLabel: r.tier_label });
    map.set(r.sketch_id, list);
  }
  return map;
}

router.get('/', async (req: Request, res: Response) => {
  const tagId = req.query.tagId as string | undefined;
  const tagIdsRaw = req.query.tagIds as string | string[] | undefined;
  const tagIds = tagId
    ? [tagId]
    : Array.isArray(tagIdsRaw)
      ? tagIdsRaw
      : typeof tagIdsRaw === 'string'
        ? tagIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

  let rows: SketchRow[];
  if (tagIds.length > 0) {
    const placeholders = tagIds.map(() => '?').join(',');
    rows = (await db
      .prepare(`SELECT * FROM sketches WHERE id IN (SELECT sketch_id FROM sketch_tags WHERE tag_id IN (${placeholders})) ORDER BY updated_at DESC`)
      .all(...tagIds)) as SketchRow[];
  } else {
    rows = (await db.prepare('SELECT * FROM sketches ORDER BY updated_at DESC').all()) as SketchRow[];
  }

  const sketchIds = rows.map((r) => r.id);
  const tagsBySketch = await getTagsForSketches(sketchIds);
  const collectionsBySketch = await getCollectionsForSketches(sketchIds);

  const sketches = await Promise.all(rows.map(async (row) => {
    const notes = (await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(row.id)) as NoteRow[];
    const refs = (await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(row.id)) as ReferenceRow[];
    return sketchRowToSketch(row, notes, refs, {
      tags: tagsBySketch.get(row.id) ?? [],
      collections: collectionsBySketch.get(row.id) ?? [],
    });
  }));
  res.json(sketches);
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id).trim();
  if (!id) {
    res.status(404).json({ error: 'Sketch not found', source: 'sketch-not-found' });
    return;
  }
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Sketch not found', source: 'sketch-not-found', id });
    return;
  }
  const notes = await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(row.id) as NoteRow[];
  const refs = await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(row.id) as ReferenceRow[];
  const tagsBySketch = await getTagsForSketches([row.id]);
  const collectionsBySketch = await getCollectionsForSketches([row.id]);
  if (process.env.VERCEL) console.log('[api] GET /api/sketches/:id 200 | id=', id);
  res.json(
    sketchRowToSketch(row, notes, refs, {
      tags: tagsBySketch.get(row.id) ?? [],
      collections: collectionsBySketch.get(row.id) ?? [],
    })
  );
});

router.get('/:id/audio', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Sketch not found' });
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

router.get('/:id/download', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const stream = await getFileStream(row.storage_key);
  if (!stream) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${row.file_name.replace(/"/g, '\\"')}"`);
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Stream error' });
  });
});

router.put('/:id/tags', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const { tagIds } = req.body as { tagIds?: string[] };
  const ids = [...new Set(Array.isArray(tagIds) ? tagIds.filter((t): t is string => typeof t === 'string') : [])];
  await db.prepare('DELETE FROM sketch_tags WHERE sketch_id = ?').run(id);
  for (const tagId of ids) {
    await db.prepare('INSERT INTO sketch_tags (sketch_id, tag_id) VALUES (?, ?)').run(id, tagId);
  }
  await createActivity('tags_updated', 'sketch', id, { sketchTitle: row.title });
  const updated = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow;
  const notes = await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(id) as NoteRow[];
  const refs = await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(id) as ReferenceRow[];
  const tagsBySketch = await getTagsForSketches([id]);
  const collectionsBySketch = await getCollectionsForSketches([id]);
  res.json(
    sketchRowToSketch(updated, notes, refs, {
      tags: tagsBySketch.get(id) ?? [],
      collections: collectionsBySketch.get(id) ?? [],
    })
  );
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { title, description, bpm, key, versionLabel } = req.body as Record<string, unknown>;
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof title === 'string') { updates.push('title = ?'); values.push(title); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description === null || description === '' ? null : description); }
  if (typeof bpm === 'number') { updates.push('bpm = ?'); values.push(bpm); }
  if (key !== undefined) { updates.push('key = ?'); values.push(key === null || key === '' ? null : key); }
  if (typeof versionLabel === 'string') { updates.push('version_label = ?'); values.push(versionLabel); }

  if (updates.length === 0) {
    const notes = (await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(id)) as NoteRow[];
    const refs = (await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(id)) as ReferenceRow[];
    const tagsBySketch = await getTagsForSketches([id]);
    const collectionsBySketch = await getCollectionsForSketches([id]);
    res.json(sketchRowToSketch(row, notes, refs, { tags: tagsBySketch.get(id) ?? [], collections: collectionsBySketch.get(id) ?? [] }));
    return;
  }

  const oldTitle = row.title;
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  await db.prepare(`UPDATE sketches SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (typeof title === 'string' && title !== oldTitle) {
    await createActivity('rename', 'sketch', id, { oldTitle, newTitle: title, sketchTitle: title });
  }
  const updated = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow;
  const notes = (await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(id)) as NoteRow[];
  const refs = (await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(id)) as ReferenceRow[];
  const tagsBySketch = await getTagsForSketches([id]);
  const collectionsBySketch = await getCollectionsForSketches([id]);
  res.json(sketchRowToSketch(updated, notes, refs, { tags: tagsBySketch.get(id) ?? [], collections: collectionsBySketch.get(id) ?? [] }));
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM sketches WHERE id = ?').get(id) as SketchRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Sketch not found' });
    return;
  }
  deleteFile(row.storage_key);
  await createActivity('delete', 'sketch', id, { sketchTitle: row.title });

  const melodyRows = await db.prepare('SELECT storage_key FROM melodies WHERE sketch_id = ?').all(id) as { storage_key: string }[];
  for (const m of melodyRows) { deleteFile(m.storage_key); }
  await db.prepare('DELETE FROM melodies WHERE sketch_id = ?').run(id);

  await db.prepare('DELETE FROM notes WHERE sketch_id = ?').run(id);
  await db.prepare('DELETE FROM sketch_references WHERE sketch_id = ?').run(id);
  await db.prepare('DELETE FROM share_tokens WHERE sketch_id = ?').run(id);
  await db.prepare('DELETE FROM sketch_tags WHERE sketch_id = ?').run(id);
  await db.prepare('DELETE FROM sketch_collections WHERE sketch_id = ?').run(id);
  await db.prepare('DELETE FROM sketches WHERE id = ?').run(id);
  res.status(204).send();
});

export default router;
