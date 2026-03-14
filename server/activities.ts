import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

export type ActivityPayload = Record<string, string | number | boolean | null | undefined>;

export async function createActivity(
  type: string,
  entityType: string,
  entityId: string | null,
  payload?: ActivityPayload
): Promise<void> {
  const id = uuidv4();
  const payloadJson = payload ? JSON.stringify(payload) : null;
  const created_at = new Date().toISOString();
  await db.prepare(
    `INSERT INTO activities (id, type, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, type, entityType, entityId ?? null, payloadJson, created_at);
}
