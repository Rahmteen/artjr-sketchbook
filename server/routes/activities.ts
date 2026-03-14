import { Router, type Request, type Response } from 'express';
import { db } from '../db.js';
import type { ActivityRow } from '../db.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const entityType = req.query.entityType as string | undefined;
  const actionType = req.query.actionType as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entityType) {
    conditions.push('entity_type = ?');
    params.push(entityType);
  }
  if (actionType) {
    const types = actionType.split(',').map((s) => s.trim()).filter(Boolean);
    if (types.length === 1) {
      conditions.push('type = ?');
      params.push(types[0]);
    } else if (types.length > 1) {
      conditions.push(`type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
  }
  if (startDate) {
    conditions.push('created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('created_at <= ?');
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (await db.prepare(`SELECT COUNT(*) as c FROM activities ${where}`).get(...params) as { c: number }).c;
  const rows = (await db
    .prepare(`SELECT * FROM activities ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)) as ActivityRow[];

  const activities = await Promise.all(rows.map(async (row) => {
    let exists = false;
    if (row.entity_id) {
      if (row.entity_type === 'sketch') {
        exists = !!(await db.prepare('SELECT 1 FROM sketches WHERE id = ?').get(row.entity_id));
      } else if (row.entity_type === 'collection') {
        exists = !!(await db.prepare('SELECT 1 FROM collections WHERE id = ?').get(row.entity_id));
      } else if (row.entity_type === 'reference_audio') {
        exists = !!(await db.prepare('SELECT 1 FROM reference_audio WHERE id = ?').get(row.entity_id));
      }
    }

    const payload = row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined;

    return {
      id: row.id,
      type: row.type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      payload,
      exists,
      createdAt: row.created_at,
    };
  }));
  res.json({ activities, total });
});

export default router;
