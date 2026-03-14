import { Link } from 'react-router-dom';
import { Play, MoreHorizontal } from 'lucide-react';
import type { ApiSketch } from '../../api/client';
import { TagPill } from './TagPill';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface SketchCardProps {
  sketch: ApiSketch;
  className?: string;
}

export function SketchCard({ sketch, className = '' }: SketchCardProps) {
  return (
    <Link
      to={`/sketches/${sketch.id}`}
      className={`group card-hover block p-5 no-underline text-inherit relative ${className}`}
    >
      {/* Waveform placeholder */}
      <div className="h-12 mb-4 rounded-md bg-surface flex items-center justify-center overflow-hidden">
        <div className="flex items-end gap-[2px] h-8">
          {Array.from({ length: 32 }).map((_, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full bg-tertiary/40"
              style={{ height: `${Math.random() * 100}%`, minHeight: '3px' }}
            />
          ))}
        </div>
      </div>

      {/* Title */}
      <h3 className="m-0 text-sm font-semibold text-text truncate">{sketch.title}</h3>

      {/* Meta row */}
      <div className="mt-1.5 flex items-center gap-2 text-xs text-tertiary">
        <span>{formatDuration(sketch.durationSeconds)}</span>
        {sketch.bpm != null && <span>· {sketch.bpm} BPM</span>}
        {sketch.key && <span>· {sketch.key}</span>}
      </div>

      {/* Tags */}
      {sketch.tags && sketch.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sketch.tags.slice(0, 3).map((t) => (
            <TagPill key={t.id} name={t.name} />
          ))}
          {sketch.tags.length > 3 && (
            <span className="text-xs text-tertiary">+{sketch.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg bg-base/40 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-accent text-white shadow-glow">
            <Play size={18} fill="currentColor" />
          </span>
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-elevated text-secondary">
            <MoreHorizontal size={16} />
          </span>
        </div>
      </div>
    </Link>
  );
}
