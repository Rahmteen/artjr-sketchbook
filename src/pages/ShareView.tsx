import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { shareApi } from '../api/client';
import { AudioPlayer } from '../components/AudioPlayer';
import { Download } from 'lucide-react';
import { SkeletonLine } from '../components/ui/Skeleton';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [sketch, setSketch] = useState<Awaited<ReturnType<typeof shareApi.resolve>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); setError('Missing share token'); return; }
    shareApi.resolve(token)
      .then(setSketch)
      .catch((e) => setError(e instanceof Error ? e.message : 'Link not found or expired'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-base">
        <div className="w-full max-w-md space-y-4">
          <SkeletonLine width="200px" height="24px" />
          <SkeletonLine width="100%" height="56px" />
        </div>
      </div>
    );
  }

  if (error || !sketch) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-base">
        <p className="text-danger">{error ?? 'Not found'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-base">
      <header className="flex items-center justify-center px-6 py-4 border-b border-border bg-surface">
        <h1 className="m-0 text-sm font-bold text-text tracking-tight">
          <span className="text-accent">artjr</span> — shared
        </h1>
      </header>
      <main className="flex-1 p-8 max-w-3xl w-full mx-auto">
        <div className="card p-8 mb-8">
          <h2 className="m-0 mb-2 text-xl font-bold text-text">{sketch.title}</h2>
          <p className="text-secondary text-sm mb-6">
            v{sketch.version}
            {sketch.versionLabel ? ` · ${sketch.versionLabel}` : ''}
            {' · '}
            {formatDuration(sketch.durationSeconds)}
            {sketch.bpm != null ? ` · ${sketch.bpm} BPM` : ''}
            {sketch.key ? ` · ${sketch.key}` : ''}
          </p>
          <AudioPlayer sketch={sketch} />
          <div className="mt-6">
            <a href={`/api/sketches/${sketch.id}/download`} download={sketch.fileName} className="btn no-underline">
              <Download size={16} /> Download
            </a>
          </div>
        </div>
        {sketch.notes.length > 0 && (
          <div className="card p-8">
            <h2 className="m-0 mb-4 text-xs font-semibold uppercase tracking-wider text-tertiary">Notes</h2>
            <ul className="list-none p-0 m-0 space-y-2">
              {sketch.notes.map((n) => (
                <li key={n.id} className="p-3 rounded-md bg-surface text-sm text-text">
                  {n.type === 'timestamp' && n.timeSeconds != null && (
                    <span className="mr-2 text-xs text-tertiary tabular-nums">
                      {formatDuration(n.timeSeconds)}
                    </span>
                  )}
                  {n.content}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
