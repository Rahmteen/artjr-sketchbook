const API = '/api';

async function handleRes<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

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
  // Per-context fields (set when viewed within a specific collection)
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

export interface ApiCollection {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
  sketchCount?: number;
}

export interface ApiTier {
  id: string;
  collectionId: string;
  label: string;
  sortOrder: number;
  color: string | null;
  sketchCount?: number;
}

export interface ApiCollectionWithTiers extends ApiCollection {
  tiers: ApiTier[];
}

export interface ApiActivity {
  id: string;
  type: string;
  entityType: string;
  entityId: string | null;
  payload?: Record<string, unknown>;
  exists: boolean;
  createdAt: string;
}

export interface ApiMelody {
  id: string;
  sketchId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  bpm?: number;
  label: string;
  color: string | null;
  offsetMs: number;
  sortOrder: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTag {
  id: string;
  name: string;
}

export const sketchesApi = {
  list: (params?: { tagId?: string; tagIds?: string[] }) => {
    const sp = new URLSearchParams();
    if (params?.tagId) sp.set('tagId', params.tagId);
    if (params?.tagIds?.length) sp.set('tagIds', params.tagIds.join(','));
    const q = sp.toString();
    return fetch(`${API}/sketches${q ? `?${q}` : ''}`).then((r) => handleRes<ApiSketch[]>(r));
  },
  get: (id: string) => fetch(`${API}/sketches/${id}`).then((r) => handleRes<ApiSketch>(r)),
  audioUrl: (id: string) => `${API}/sketches/${id}/audio`,
  downloadUrl: (id: string) => `${API}/sketches/${id}/download`,
  patch: (
    id: string,
    body: Partial<{
      title: string;
      description: string;
      bpm: number;
      key: string;
      versionLabel: string;
    }>
  ) =>
    fetch(`${API}/sketches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => handleRes<ApiSketch>(r)),
  setTags: (id: string, tagIds: string[]) =>
    fetch(`${API}/sketches/${id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    }).then((r) => handleRes<ApiSketch>(r)),
  delete: (id: string) => fetch(`${API}/sketches/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
};

const UPLOAD_DEBUG = true; // set false to reduce console noise

export const uploadApi = {
  sketch: (formData: FormData) => {
    const url = `${API}/upload/sketch`;
    if (UPLOAD_DEBUG) {
      const file = formData.get('file');
      console.log('[upload client] POST', url, '| file=', file instanceof File ? { name: file.name, size: file.size, type: file.type } : 'none', '| formData keys=', [...formData.keys()]);
    }
    return fetch(url, { method: 'POST', body: formData }).then((r) => {
      if (UPLOAD_DEBUG || !r.ok) {
        console.log('[upload client] response', r.status, r.statusText, '| url=', r.url);
      }
      if (!r.ok) {
        return r.text().then((text) => {
          console.error('[upload client] error body:', text.slice(0, 500));
          try {
            const err = JSON.parse(text);
            throw new Error((err as { error?: string }).error ?? text || r.statusText);
          } catch (e) {
            if (e instanceof Error && e.message !== r.statusText) throw e;
            throw new Error(text || r.statusText);
          }
        });
      }
      return r.json() as Promise<ApiSketch>;
    });
  },
  replaceSketch: (id: string, formData: FormData) =>
    fetch(`${API}/upload/sketch/replace/${id}`, { method: 'POST', body: formData }).then((r) => handleRes<ApiSketch>(r)),
  reference: (formData: FormData) =>
    fetch(`${API}/upload/reference`, { method: 'POST', body: formData }).then((r) => handleRes<ApiReferenceAudio>(r)),
};

export const notesApi = {
  list: (sketchId: string) => fetch(`${API}/notes/sketch/${sketchId}`).then((r) => handleRes<ApiNote[]>(r)),
  create: (sketchId: string, body: { type: 'timestamp' | 'general'; content: string; timeSeconds?: number }) =>
    fetch(`${API}/notes/sketch/${sketchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => handleRes<ApiNote>(r)),
  patch: (id: string, body: { content?: string; timeSeconds?: number }) =>
    fetch(`${API}/notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) =>
      handleRes<ApiNote>(r)
    ),
  delete: (id: string) => fetch(`${API}/notes/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
};

export const referencesApi = {
  list: (sketchId: string) => fetch(`${API}/references/sketch/${sketchId}`).then((r) => handleRes<ApiReference[]>(r)),
  create: (
    sketchId: string,
    body: { type: 'link' | 'sketch' | 'reference_audio'; url?: string; targetSketchId?: string; referenceAudioId?: string; label?: string }
  ) =>
    fetch(`${API}/references/sketch/${sketchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => handleRes<ApiReference>(r)),
  delete: (id: string) => fetch(`${API}/references/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
};

export const referenceAudioApi = {
  list: () => fetch(`${API}/reference-audio`).then((r) => handleRes<ApiReferenceAudio[]>(r)),
  audioUrl: (id: string) => `${API}/reference-audio/${id}/audio`,
  delete: (id: string) => fetch(`${API}/reference-audio/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
};

export const shareApi = {
  create: (sketchId: string, expiresInHours?: number) =>
    fetch(`${API}/share/sketch/${sketchId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInHours }),
    }).then((r) =>
      handleRes<{ token: string; shareUrl: string; expiresAt?: string; createdAt: string }>(r)
    ),
  resolve: (token: string) => fetch(`${API}/share/resolve/${token}`).then((r) => handleRes<ApiSketch>(r)),
};

export const activitiesApi = {
  list: (params?: {
    limit?: number;
    offset?: number;
    entityType?: string;
    actionType?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set('limit', String(params.limit));
    if (params?.offset != null) sp.set('offset', String(params.offset));
    if (params?.entityType) sp.set('entityType', params.entityType);
    if (params?.actionType) sp.set('actionType', params.actionType);
    if (params?.startDate) sp.set('startDate', params.startDate);
    if (params?.endDate) sp.set('endDate', params.endDate);
    const q = sp.toString();
    return fetch(`${API}/activities${q ? `?${q}` : ''}`).then((r) =>
      handleRes<{ activities: ApiActivity[]; total: number }>(r)
    );
  },
};

export const collectionsApi = {
  list: () => fetch(`${API}/collections`).then((r) => handleRes<ApiCollection[]>(r)),
  get: (id: string) => fetch(`${API}/collections/${id}`).then((r) => handleRes<ApiCollectionWithTiers>(r)),
  create: (name: string) =>
    fetch(`${API}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => handleRes<ApiCollection>(r)),
  update: (id: string, body: { name?: string }) =>
    fetch(`${API}/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => handleRes<ApiCollectionWithTiers>(r)),
  delete: (id: string) => fetch(`${API}/collections/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
  getSketches: (id: string) => fetch(`${API}/collections/${id}/sketches`).then((r) => handleRes<ApiSketch[]>(r)),
  addSketches: (collectionId: string, sketchIds: string[], tierId?: string) =>
    fetch(`${API}/collections/${collectionId}/sketches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sketchIds, tierId }),
    }).then((r) => handleRes<{ added: number }>(r)),
  removeSketch: (collectionId: string, sketchId: string) =>
    fetch(`${API}/collections/${collectionId}/sketches/${sketchId}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
  updateSketchInCollection: (collectionId: string, sketchId: string, body: { tierId?: string | null; sortOrder?: number }) =>
    fetch(`${API}/collections/${collectionId}/sketches/${sketchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => handleRes<{ id: string; sketchId: string; collectionId: string; tierId: string | null; sortOrder: number }>(r)),
  reorderTiers: (collectionId: string, tierIds: string[]) =>
    fetch(`${API}/collections/${collectionId}/tiers-reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierIds }),
    }).then((r) => handleRes<ApiTier[]>(r)),
  tiers: {
    list: (collectionId: string) =>
      fetch(`${API}/collections/${collectionId}/tiers`).then((r) => handleRes<ApiTier[]>(r)),
    create: (collectionId: string, label: string, color?: string) =>
      fetch(`${API}/collections/${collectionId}/tiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, color }),
      }).then((r) => handleRes<ApiTier>(r)),
    update: (collectionId: string, tierId: string, body: { label?: string; sortOrder?: number; color?: string | null }) =>
      fetch(`${API}/collections/${collectionId}/tiers/${tierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => handleRes<ApiTier>(r)),
    delete: (collectionId: string, tierId: string) =>
      fetch(`${API}/collections/${collectionId}/tiers/${tierId}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
  },
};

export const melodiesApi = {
  list: (sketchId: string) =>
    fetch(`${API}/melodies/sketch/${sketchId}`).then((r) => handleRes<ApiMelody[]>(r)),
  upload: (sketchId: string, formData: FormData) =>
    fetch(`${API}/melodies/upload/${sketchId}`, { method: 'POST', body: formData }).then((r) => handleRes<ApiMelody>(r)),
  audioUrl: (id: string) => `${API}/melodies/${id}/audio`,
  patch: (id: string, body: Partial<{ label: string; color: string | null; offsetMs: number; sortOrder: number; notes: string | null }>) =>
    fetch(`${API}/melodies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => handleRes<ApiMelody>(r)),
  delete: (id: string) => fetch(`${API}/melodies/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
};

export const tagsApi = {
  list: () => fetch(`${API}/tags`).then((r) => handleRes<ApiTag[]>(r)),
  create: (name: string) =>
    fetch(`${API}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => handleRes<ApiTag>(r)),
  get: (id: string) => fetch(`${API}/tags/${id}`).then((r) => handleRes<ApiTag>(r)),
  delete: (id: string) => fetch(`${API}/tags/${id}`, { method: 'DELETE' }).then((r) => handleRes<void>(r)),
};
