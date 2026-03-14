import { useState } from 'react';
import { notesApi } from '../api/client';

interface NoteFormProps {
  sketchId: string;
  currentTimeSeconds: () => number;
  onAdded: () => void;
}

export function NoteForm({ sketchId, currentTimeSeconds, onAdded }: NoteFormProps) {
  const [type, setType] = useState<'timestamp' | 'general'>('general');
  const [content, setContent] = useState('');
  const [timeSeconds, setTimeSeconds] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    const payload = type === 'timestamp'
      ? { type: 'timestamp' as const, content: content.trim(), timeSeconds: timeSeconds ? Number(timeSeconds) : currentTimeSeconds() }
      : { type: 'general' as const, content: content.trim() };
    notesApi
      .create(sketchId, payload)
      .then(() => { setContent(''); setTimeSeconds(''); onAdded(); })
      .finally(() => setLoading(false));
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-4">
      <div>
        <label className="block mb-1.5 text-xs font-medium text-tertiary">Type</label>
        <select className="form-input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="general">General note</option>
          <option value="timestamp">Timestamp note</option>
        </select>
      </div>
      {type === 'timestamp' && (
        <div>
          <label className="block mb-1.5 text-xs font-medium text-tertiary">
            Time (seconds) -- leave empty to use current playback time
          </label>
          <input type="number" step="0.1" className="form-input" value={timeSeconds} onChange={(e) => setTimeSeconds(e.target.value)} placeholder={`e.g. ${currentTimeSeconds().toFixed(1)}`} />
        </div>
      )}
      <div>
        <label className="block mb-1.5 text-xs font-medium text-tertiary">Content</label>
        <textarea className="form-input min-h-[80px] resize-y" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Note text..." rows={2} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Adding...' : 'Add note'}
      </button>
    </form>
  );
}
