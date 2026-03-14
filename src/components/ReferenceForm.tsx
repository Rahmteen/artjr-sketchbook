import { useState } from 'react';
import { referencesApi } from '../api/client';
import type { ApiSketch, ApiReferenceAudio } from '../api/client';

interface ReferenceFormProps {
  sketchId: string;
  otherSketches: ApiSketch[];
  referenceAudios: ApiReferenceAudio[];
  onAdded: () => void;
}

export function ReferenceForm({ sketchId, otherSketches, referenceAudios, onAdded }: ReferenceFormProps) {
  const [type, setType] = useState<'link' | 'sketch' | 'reference_audio'>('link');
  const [url, setUrl] = useState('');
  const [targetSketchId, setTargetSketchId] = useState('');
  const [referenceAudioId, setReferenceAudioId] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const body: Parameters<typeof referencesApi.create>[1] = { type, label: label.trim() || undefined };
    if (type === 'link') body.url = url.trim();
    if (type === 'sketch') body.targetSketchId = targetSketchId;
    if (type === 'reference_audio') body.referenceAudioId = referenceAudioId;
    referencesApi
      .create(sketchId, body)
      .then(() => { setUrl(''); setTargetSketchId(''); setReferenceAudioId(''); setLabel(''); onAdded(); })
      .finally(() => setLoading(false));
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-4">
      <div>
        <label className="block mb-1.5 text-xs font-medium text-tertiary">Type</label>
        <select className="form-input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="link">Link</option>
          <option value="sketch">Another sketch</option>
          <option value="reference_audio">Reference audio</option>
        </select>
      </div>
      {type === 'link' && (
        <div>
          <label className="block mb-1.5 text-xs font-medium text-tertiary">URL</label>
          <input type="url" className="form-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required />
        </div>
      )}
      {type === 'sketch' && (
        <div>
          <label className="block mb-1.5 text-xs font-medium text-tertiary">Sketch</label>
          <select className="form-input" value={targetSketchId} onChange={(e) => setTargetSketchId(e.target.value)} required>
            <option value="">Select a sketch</option>
            {otherSketches.map((s) => <option key={s.id} value={s.id}>{s.title} (v{s.version})</option>)}
          </select>
        </div>
      )}
      {type === 'reference_audio' && (
        <div>
          <label className="block mb-1.5 text-xs font-medium text-tertiary">Reference audio</label>
          <select className="form-input" value={referenceAudioId} onChange={(e) => setReferenceAudioId(e.target.value)} required>
            <option value="">Select reference audio</option>
            {referenceAudios.map((ra) => <option key={ra.id} value={ra.id}>{ra.label || ra.fileName}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block mb-1.5 text-xs font-medium text-tertiary">Label (optional)</label>
        <input type="text" className="form-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Short label" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Adding...' : 'Add reference'}
      </button>
    </form>
  );
}
