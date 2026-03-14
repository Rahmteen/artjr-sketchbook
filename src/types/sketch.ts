/** Note on a sketch: timestamp (with time) or general. */
export interface Note {
  id: string;
  sketchId: string;
  type: 'timestamp' | 'general';
  /** For timestamp notes: position in seconds */
  timeSeconds?: number;
  content: string;
  createdAt: string;
}

/** Reference type: link, another sketch, or reference-only audio. */
export type ReferenceType = 'link' | 'sketch' | 'reference_audio';

export interface Reference {
  id: string;
  sketchId: string;
  type: ReferenceType;
  url?: string;
  targetSketchId?: string;
  referenceAudioId?: string;
  label?: string;
  createdAt?: string;
}

/** Reference-only audio (not in main sketches list). */
export interface ReferenceAudio {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  label?: string;
  createdAt: string;
}

/** Main sketch (uploaded audio with versioning). */
export interface Sketch {
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
  createdBy?: string;
  notes: Note[];
  references: Reference[];
  collections?: { collectionId: string; collectionName: string; tierId: string | null; tierLabel: string | null }[];
  tierId?: string | null;
  tierLabel?: string | null;
  sortOrder?: number;
  tagIds?: string[];
  tags?: { id: string; name: string }[];
}

/** Payload for creating/updating sketch metadata. */
export interface SketchMetadataUpdate {
  title?: string;
  description?: string;
  bpm?: number;
  key?: string;
  versionLabel?: string;
}

/** Share link token record. */
export interface ShareToken {
  id: string;
  sketchId: string;
  token: string;
  expiresAt?: string;
  createdAt: string;
}
