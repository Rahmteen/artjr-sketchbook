import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { createActivity } from '../activities.js';
import { sketchRowToSketch } from '../map.js';
import { strParam } from '../param.js';
import type {
  CollectionRow,
  CollectionTierRow,
  SketchRow,
  NoteRow,
  ReferenceRow,
  SketchTagRow,
  TagRow,
  SketchCollectionRow,
} from '../db.js';

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

async function getCollectionsForSketches(sketchIds: string[]): Promise<Map<string, { collectionId: string; collectionName: string; tierId: string | null; tierLabel: string | null }[]>> {
  if (!sketchIds.length) return new Map();
  const rows = (await db.prepare(
    `SELECT sc.sketch_id, sc.collection_id, c.name as collection_name, sc.tier_id, ct.label as tier_label
     FROM sketch_collections sc
     JOIN collections c ON c.id = sc.collection_id
     LEFT JOIN collection_tiers ct ON ct.id = sc.tier_id
     WHERE sc.sketch_id IN (${sketchIds.map(() => '?').join(',')})`
  ).all(...sketchIds)) as { sketch_id: string; collection_id: string; collection_name: string; tier_id: string | null; tier_label: string | null }[];
  const map = new Map<string, { collectionId: string; collectionName: string; tierId: string | null; tierLabel: string | null }[]>();
  for (const r of rows) {
    const list = map.get(r.sketch_id) ?? [];
    list.push({ collectionId: r.collection_id, collectionName: r.collection_name, tierId: r.tier_id, tierLabel: r.tier_label });
    map.set(r.sketch_id, list);
  }
  return map;
}

// List all collections with sketch counts
router.get('/', async (_req: Request, res: Response) => {
  const rows = (await db
    .prepare(`
      SELECT c.*, COALESCE(cnt.sketch_count, 0) as sketch_count
      FROM collections c
      LEFT JOIN (SELECT collection_id, COUNT(*) as sketch_count FROM sketch_collections GROUP BY collection_id) cnt
        ON cnt.collection_id = c.id
      ORDER BY c.updated_at DESC, c.created_at DESC
    `)
    .all()) as (CollectionRow & { sketch_count: number })[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sketchCount: r.sketch_count,
    }))
  );
});

// Create collection
router.post('/', async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name.trim(), now, now);
  await createActivity('create', 'collection', id, { collectionName: name.trim() });
  res.status(201).json({ id, name: name.trim(), createdAt: now, updatedAt: now, sketchCount: 0 });
});

// Get single collection with tiers
router.get('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const tiers = (await db
    .prepare('SELECT * FROM collection_tiers WHERE collection_id = ? ORDER BY sort_order ASC, label ASC')
    .all(id)) as CollectionTierRow[];

  const tierSketchCounts = (await db.prepare(
    `SELECT tier_id, COUNT(*) as cnt FROM sketch_collections WHERE collection_id = ? GROUP BY tier_id`
  ).all(id)) as { tier_id: string | null; cnt: number }[];
  const countMap = new Map(tierSketchCounts.map((r) => [r.tier_id, r.cnt]));

  res.json({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tiers: tiers.map((t) => ({
      id: t.id,
      collectionId: t.collection_id,
      label: t.label,
      sortOrder: t.sort_order,
      color: t.color ?? null,
      sketchCount: countMap.get(t.id) ?? 0,
    })),
  });
});

// Update collection name (tierLabels approach removed — use individual tier CRUD)
router.patch('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const { name } = req.body as { name?: string };
  if (typeof name === 'string' && name.trim()) {
    const oldName = row.name;
    await db.prepare('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), new Date().toISOString(), id);
    if (oldName !== name.trim()) {
      await createActivity('rename', 'collection', id, { oldName, newName: name.trim(), collectionName: name.trim() });
    } else {
      await createActivity('update', 'collection', id, { collectionName: name.trim() });
    }
  }
  const updated = await db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow;
  const tiers = await db.prepare('SELECT * FROM collection_tiers WHERE collection_id = ? ORDER BY sort_order ASC').all(id) as CollectionTierRow[];
  const tierSketchCounts = await db.prepare(
    `SELECT tier_id, COUNT(*) as cnt FROM sketch_collections WHERE collection_id = ? GROUP BY tier_id`
  ).all(id) as { tier_id: string | null; cnt: number }[];
  const countMap = new Map(tierSketchCounts.map((r) => [r.tier_id, r.cnt]));
  res.json({
    id: updated.id,
    name: updated.name,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
    tiers: tiers.map((t) => ({
      id: t.id,
      collectionId: t.collection_id,
      label: t.label,
      sortOrder: t.sort_order,
      color: t.color ?? null,
      sketchCount: countMap.get(t.id) ?? 0,
    })),
  });
});

// Delete collection
router.delete('/:id', async (req: Request, res: Response) => {
  const id = strParam(req.params.id);
  const row = await db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as CollectionRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  await db.prepare('DELETE FROM sketch_collections WHERE collection_id = ?').run(id);
  await db.prepare('DELETE FROM collection_tiers WHERE collection_id = ?').run(id);
  await db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  await createActivity('delete', 'collection', id, { collectionName: row.name });
  res.status(204).send();
});

// Get sketches in a collection (via join table)
router.get('/:id/sketches', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const col = await db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as CollectionRow | undefined;
  if (!col) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const scRows = (await db.prepare(
    `SELECT sc.tier_id, sc.sort_order, s.*
     FROM sketch_collections sc
     JOIN sketches s ON s.id = sc.sketch_id
     WHERE sc.collection_id = ?
     ORDER BY sc.sort_order ASC, s.updated_at DESC`
  ).all(collectionId)) as (SketchRow & { tier_id: string | null; sort_order: number })[];

  const sketchIds = scRows.map((r) => r.id);
  const tagsBySketch = await getTagsForSketches(sketchIds);
  const collectionsBySketch = await getCollectionsForSketches(sketchIds);

  const tiers = (await db.prepare('SELECT id, label FROM collection_tiers WHERE collection_id = ?').all(collectionId)) as { id: string; label: string }[];
  const tierLabelMap = new Map(tiers.map((t) => [t.id, t.label]));

  const sketches = await Promise.all(scRows.map(async (row) => {
    const notes = (await db.prepare('SELECT * FROM notes WHERE sketch_id = ?').all(row.id)) as NoteRow[];
    const refs = (await db.prepare('SELECT * FROM sketch_references WHERE sketch_id = ?').all(row.id)) as ReferenceRow[];
    const tags = tagsBySketch.get(row.id) ?? [];
    const collections = collectionsBySketch.get(row.id) ?? [];
    const sketch = sketchRowToSketch(row, notes, refs, { tags, collections });
    // Override tierId/tierLabel to reflect this collection's assignment
    sketch.tierId = row.tier_id ?? undefined;
    sketch.tierLabel = row.tier_id ? tierLabelMap.get(row.tier_id) ?? undefined : undefined;
    sketch.sortOrder = row.sort_order;
    return sketch;
  }));
  res.json(sketches);
});

// Add sketches to a collection
router.post('/:id/sketches', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const col = await db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as CollectionRow | undefined;
  if (!col) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const { sketchIds, tierId } = req.body as { sketchIds?: string[]; tierId?: string };
  if (!Array.isArray(sketchIds) || sketchIds.length === 0) {
    res.status(400).json({ error: 'sketchIds is required' });
    return;
  }
  if (tierId) {
    const tier = await db.prepare('SELECT id FROM collection_tiers WHERE id = ? AND collection_id = ?').get(tierId, collectionId);
    if (!tier) {
      res.status(400).json({ error: 'Tier does not belong to this collection' });
      return;
    }
  }
  const now = new Date().toISOString();
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM sketch_collections WHERE collection_id = ?').get(collectionId) as { next: number };
  let nextOrder = maxOrder.next;
  const insertSql = 'INSERT INTO sketch_collections (id, sketch_id, collection_id, tier_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (sketch_id, collection_id) DO NOTHING';
  const insert = db.prepare(insertSql);
  for (const sketchId of sketchIds) {
    await insert.run(uuidv4(), sketchId, collectionId, tierId ?? null, nextOrder++, now);
  }
  await db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now, collectionId);

  const addedSketches = await Promise.all(sketchIds.map(async (sid) => {
    const sk = await db.prepare('SELECT id, title FROM sketches WHERE id = ?').get(sid) as { id: string; title: string } | undefined;
    return { id: sid, title: sk?.title ?? 'Unknown' };
  }));
  await createActivity('sketches_added', 'collection', collectionId, {
    collectionName: col.name,
    count: sketchIds.length,
    sketches: JSON.stringify(addedSketches),
  });
  res.status(201).json({ added: sketchIds.length });
});

// Remove a sketch from a collection
router.delete('/:id/sketches/:sketchId', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const sketchId = strParam(req.params.sketchId);
  await db.prepare('DELETE FROM sketch_collections WHERE collection_id = ? AND sketch_id = ?').run(collectionId, sketchId);
  await db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), collectionId);
  res.status(204).send();
});

// Update a sketch's tier/sort_order within a collection
router.patch('/:id/sketches/:sketchId', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const sketchId = strParam(req.params.sketchId);
  const scRow = await db.prepare('SELECT * FROM sketch_collections WHERE collection_id = ? AND sketch_id = ?').get(collectionId, sketchId) as SketchCollectionRow | undefined;
  if (!scRow) {
    res.status(404).json({ error: 'Sketch not in this collection' });
    return;
  }
  const { tierId, sortOrder } = req.body as { tierId?: string | null; sortOrder?: number };
  const updates: string[] = [];
  const values: unknown[] = [];
  const oldTierId = scRow.tier_id;

  if (tierId !== undefined) {
    if (tierId !== null) {
      const tier = await db.prepare('SELECT id FROM collection_tiers WHERE id = ? AND collection_id = ?').get(tierId, collectionId);
      if (!tier) {
        res.status(400).json({ error: 'Tier does not belong to this collection' });
        return;
      }
    }
    updates.push('tier_id = ?');
    values.push(tierId);
  }
  if (typeof sortOrder === 'number') {
    updates.push('sort_order = ?');
    values.push(sortOrder);
  }
  if (updates.length > 0) {
    values.push(collectionId, sketchId);
    await db.prepare(`UPDATE sketch_collections SET ${updates.join(', ')} WHERE collection_id = ? AND sketch_id = ?`).run(...values);
  }

  if (tierId !== undefined && tierId !== oldTierId) {
    const sketch = await db.prepare('SELECT title FROM sketches WHERE id = ?').get(sketchId) as { title: string } | undefined;
    const col = await db.prepare('SELECT name FROM collections WHERE id = ?').get(collectionId) as { name: string } | undefined;
    const newTierLabel = tierId ? (await db.prepare('SELECT label FROM collection_tiers WHERE id = ?').get(tierId) as { label: string } | undefined)?.label ?? 'Unknown' : 'Unassigned';
    await createActivity('tier_move', 'sketch', sketchId, {
      sketchTitle: sketch?.title ?? 'Unknown',
      collectionId,
      collectionName: col?.name ?? 'Unknown',
      toTierLabel: newTierLabel,
    });
  }

  const updated = await db.prepare('SELECT * FROM sketch_collections WHERE collection_id = ? AND sketch_id = ?').get(collectionId, sketchId) as SketchCollectionRow;
  res.json({
    id: updated.id,
    sketchId: updated.sketch_id,
    collectionId: updated.collection_id,
    tierId: updated.tier_id,
    sortOrder: updated.sort_order,
  });
});

// ── Tier CRUD ──

router.get('/:id/tiers', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const col = await db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as CollectionRow | undefined;
  if (!col) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const tiers = (await db
    .prepare('SELECT * FROM collection_tiers WHERE collection_id = ? ORDER BY sort_order ASC, label ASC')
    .all(collectionId)) as CollectionTierRow[];
  const tierSketchCounts = (await db.prepare(
    `SELECT tier_id, COUNT(*) as cnt FROM sketch_collections WHERE collection_id = ? GROUP BY tier_id`
  ).all(collectionId)) as { tier_id: string | null; cnt: number }[];
  const countMap = new Map(tierSketchCounts.map((r) => [r.tier_id, r.cnt]));
  res.json(tiers.map((t) => ({
    id: t.id,
    collectionId: t.collection_id,
    label: t.label,
    sortOrder: t.sort_order,
    color: t.color ?? null,
    sketchCount: countMap.get(t.id) ?? 0,
  })));
});

router.post('/:id/tiers', async (req: Request, res: Response) => {
  const collectionId = req.params.id;
  const col = await db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId) as CollectionRow | undefined;
  if (!col) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  const { label, color } = req.body as { label?: string; color?: string };
  if (!label || typeof label !== 'string' || !label.trim()) {
    res.status(400).json({ error: 'label is required' });
    return;
  }
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM collection_tiers WHERE collection_id = ?').get(collectionId) as { next: number };
  const id = uuidv4();
  await db.prepare('INSERT INTO collection_tiers (id, collection_id, label, sort_order, color) VALUES (?, ?, ?, ?, ?)').run(
    id, collectionId, label.trim(), maxOrder.next, color ?? null
  );
  res.status(201).json({
    id,
    collectionId,
    label: label.trim(),
    sortOrder: maxOrder.next,
    color: color ?? null,
    sketchCount: 0,
  });
});

router.put('/:id/tiers/:tierId', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const tierId = strParam(req.params.tierId);
  const tier = await db.prepare('SELECT * FROM collection_tiers WHERE id = ? AND collection_id = ?').get(tierId, collectionId) as CollectionTierRow | undefined;
  if (!tier) {
    res.status(404).json({ error: 'Tier not found' });
    return;
  }
  const { label, sortOrder, color } = req.body as { label?: string; sortOrder?: number; color?: string | null };
  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof label === 'string') { updates.push('label = ?'); values.push(label.trim()); }
  if (typeof sortOrder === 'number') { updates.push('sort_order = ?'); values.push(sortOrder); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color); }
  if (updates.length > 0) {
    values.push(tierId);
    await db.prepare(`UPDATE collection_tiers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
  const updated = await db.prepare('SELECT * FROM collection_tiers WHERE id = ?').get(tierId) as CollectionTierRow;
  const cnt = await db.prepare('SELECT COUNT(*) as cnt FROM sketch_collections WHERE collection_id = ? AND tier_id = ?').get(collectionId, tierId) as { cnt: number };
  res.json({
    id: updated.id,
    collectionId: updated.collection_id,
    label: updated.label,
    sortOrder: updated.sort_order,
    color: updated.color ?? null,
    sketchCount: cnt.cnt,
  });
});

router.delete('/:id/tiers/:tierId', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const tierId = strParam(req.params.tierId);
  const tier = await db.prepare('SELECT * FROM collection_tiers WHERE id = ? AND collection_id = ?').get(tierId, collectionId) as CollectionTierRow | undefined;
  if (!tier) {
    res.status(404).json({ error: 'Tier not found' });
    return;
  }
  await db.prepare('UPDATE sketch_collections SET tier_id = NULL WHERE tier_id = ?').run(tierId);
  await db.prepare('DELETE FROM collection_tiers WHERE id = ?').run(tierId);
  res.status(204).send();
});

// Bulk reorder tiers
router.put('/:id/tiers-reorder', async (req: Request, res: Response) => {
  const collectionId = strParam(req.params.id);
  const { tierIds } = req.body as { tierIds?: string[] };
  if (!Array.isArray(tierIds)) {
    res.status(400).json({ error: 'tierIds array is required' });
    return;
  }
  const update = db.prepare('UPDATE collection_tiers SET sort_order = ? WHERE id = ? AND collection_id = ?');
  for (let i = 0; i < tierIds.length; i++) {
    await update.run(i, tierIds[i], collectionId);
  }
  const tiers = await db.prepare('SELECT * FROM collection_tiers WHERE collection_id = ? ORDER BY sort_order ASC').all(collectionId) as CollectionTierRow[];
  const tierSketchCounts = await db.prepare(
    `SELECT tier_id, COUNT(*) as cnt FROM sketch_collections WHERE collection_id = ? GROUP BY tier_id`
  ).all(collectionId) as { tier_id: string | null; cnt: number }[];
  const countMap = new Map(tierSketchCounts.map((r) => [r.tier_id, r.cnt]));
  res.json(tiers.map((t) => ({
    id: t.id,
    collectionId: t.collection_id,
    label: t.label,
    sortOrder: t.sort_order,
    color: t.color ?? null,
    sketchCount: countMap.get(t.id) ?? 0,
  })));
});

export default router;
