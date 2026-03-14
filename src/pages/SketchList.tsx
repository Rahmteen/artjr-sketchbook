import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSketchStore } from '../stores/sketchStore';
import { sketchesApi, type ApiSketch } from '../api/client';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '–';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SketchList() {
  const { sketches, setSketches } = useSketchStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    sketchesApi
      .list()
      .then((list) => {
        if (!cancelled) setSketches(list as ApiSketch[]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [setSketches]);

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="text-text-muted">Loading sketches…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-danger">{error}</p>
        <p className="text-sm text-text-muted">
          Make sure the server is running: <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">npm run server</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-text-muted">Sketches</h2>
        <Link to="/sketches/upload" className="btn btn-primary">Upload sketch</Link>
      </div>
      <div className="glass-card overflow-hidden divide-y divide-border">
        {sketches.length === 0 ? (
          <p className="p-8 m-0 text-text-muted">
            No sketches yet. Upload an audio file to get started.
          </p>
        ) : (
          sketches.map((s) => (
            <Link
              key={s.id}
              to={`/sketches/${s.id}`}
              className="block p-6 text-inherit no-underline transition-colors hover:bg-surface-hover"
            >
              <p className="m-0 mb-1 text-[0.9375rem] font-medium text-text">{s.title}</p>
              <p className="m-0 text-xs text-text-muted">
                v{s.version}
                {s.versionLabel ? ` · ${s.versionLabel}` : ''}
                {' · '}
                {formatDuration(s.durationSeconds)}
                {s.bpm != null ? ` · ${s.bpm} BPM` : ''}
                {s.key ? ` · ${s.key}` : ''}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
