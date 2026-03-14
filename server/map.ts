import type { SketchRow, NoteRow, ReferenceRow } from './db.js';

export interface ApiSketchCollection {
  collectionId: string;
  collectionName: string;
  tierId: string | null;
  tierLabel: string | null;
}

export interface ApiSketch {
  id: string;
  groupId: string | null;
  version: number;
  versionLabel?: string;
  title: string;
  description?: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  bpm?: number;
  durationSeconds?: number;
  key?: string;
  createdAt: string;
  updatedAt: string;
  notes: ApiNote[];
  references: ApiReference[];
  collections?: ApiSketchCollection[];
  // Per-context overrides (set when viewing within a specific collection)
  tierId?: string | null;
  tierLabel?: string | null;
  sortOrder?: number;
  tagIds?: string[];
  tags?: { id: string; name: string }[];
}

export interface ApiNote {
  id: string;
  sketchId: string;
  type: 'timestamp' | 'general';
  timeSeconds?: number;
  content: string;
  createdAt: string;
}

export interface ApiReference {
  id: string;
  sketchId: string;
  type: 'link' | 'sketch' | 'reference_audio';
  url?: string;
  targetSketchId?: string;
  referenceAudioId?: string;
  label?: string;
  createdAt?: string;
}

export interface ApiReferenceAudio {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  label?: string;
  createdAt: string;
}

export function sketchRowToSketch(
  row: SketchRow,
  notes: NoteRow[],
  refs: ReferenceRow[],
  opts?: {
    tags?: { id: string; name: string }[];
    collections?: ApiSketchCollection[];
  }
): ApiSketch {
  return {
    id: row.id,
    groupId: row.group_id,
    version: row.version,
    versionLabel: row.version_label ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    storageKey: row.storage_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    bpm: row.bpm ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    key: row.key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: notes.map(noteRowToNote),
    references: refs.map(refRowToRef),
    collections: opts?.collections ?? [],
    tags: opts?.tags,
    tagIds: opts?.tags?.map((t) => t.id),
  };
}

function noteRowToNote(row: NoteRow): ApiNote {
  return {
    id: row.id,
    sketchId: row.sketch_id,
    type: row.type,
    timeSeconds: row.time_seconds ?? undefined,
    content: row.content,
    createdAt: row.created_at,
  };
}

function refRowToRef(row: ReferenceRow): ApiReference {
  return {
    id: row.id,
    sketchId: row.sketch_id,
    type: row.type,
    url: row.url ?? undefined,
    targetSketchId: row.target_sketch_id ?? undefined,
    referenceAudioId: row.reference_audio_id ?? undefined,
    label: row.label ?? undefined,
    createdAt: row.created_at,
  };
}

export function referenceAudioRowToApi(row: {
  id: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  label: string | null;
  created_at: string;
}): ApiReferenceAudio {
  return {
    id: row.id,
    storageKey: row.storage_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    label: row.label ?? undefined,
    createdAt: row.created_at,
  };
}
