import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FolderOpen, Music2 } from 'lucide-react';
import { activitiesApi, collectionsApi, sketchesApi } from '../api/client';
import type { ApiActivity, ApiCollection, ApiSketch } from '../api/client';
import { SkeletonLine, SkeletonCard } from '../components/ui/Skeleton';
import { Stagger, StaggerItem, StaggerList, StaggerRow } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { ActivityRow } from '../components/ActivityRow';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Home() {
  const [activities, setActivities] = useState<ApiActivity[]>([]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [sketches, setSketches] = useState<ApiSketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      activitiesApi.list({ limit: 10, offset: 0 }),
      collectionsApi.list(),
      sketchesApi.list(),
    ])
      .then(([actRes, cols, skList]) => {
        if (cancelled) return;
        setActivities(actRes.activities.slice(0, 10));
        setCollections(cols.slice(0, 6));
        setSketches(skList.slice(0, 5));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const showSkeleton = useDelayedLoading(loading);

  if (loading && !showSkeleton) return null;

  if (showSkeleton) {
    return (
      <div className="space-y-12">
        <section className="space-y-4">
          <SkeletonLine width="120px" height="12px" />
          <div className="card p-0 overflow-hidden divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex gap-4">
                <SkeletonLine width="80px" height="14px" />
                <SkeletonLine width="60%" height="14px" />
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-4">
          <SkeletonLine width="120px" height="12px" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <Stagger className="space-y-12">
      {/* Activity timeline */}
      <StaggerItem>
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">
              Timeline
            </h2>
            <Link to="/timeline" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="card overflow-hidden">
            {activities.length === 0 ? (
              <p className="p-8 m-0 text-secondary text-sm text-center">No activity yet</p>
            ) : (
              <StaggerList className="divide-y divide-border" delay={0.1}>
                {activities.slice(0, 8).map((a) => (
                  <StaggerRow key={a.id} className="px-6 py-3.5 flex items-center gap-4">
                    <span className="text-xs text-tertiary shrink-0 tabular-nums w-[100px]">{formatDate(a.createdAt)}</span>
                    <ActivityRow activity={a} />
                  </StaggerRow>
                ))}
              </StaggerList>
            )}
          </div>
        </section>
      </StaggerItem>

      {/* Collections */}
      <StaggerItem>
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">
              Collections
            </h2>
            <Link to="/collections" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {collections.length === 0 ? (
            <div className="card p-10">
              <p className="m-0 text-secondary text-sm text-center">No collections yet</p>
            </div>
          ) : (
            <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" delay={0.15}>
              {collections.map((c) => (
                <StaggerItem key={c.id}>
                  <Link
                    to={`/collections/${c.id}`}
                    className="group card-hover block p-5 text-inherit no-underline relative overflow-hidden"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex shrink-0 items-center justify-center w-10 h-10 rounded-md bg-accent/10 text-accent">
                        <FolderOpen size={20} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 font-semibold text-text truncate group-hover:text-accent transition-colors">
                          {c.name}
                        </p>
                        <p className="m-0 mt-1.5 text-xs text-tertiary tabular-nums">
                          {c.sketchCount != null && c.sketchCount > 0
                            ? `${c.sketchCount} sketch${c.sketchCount === 1 ? '' : 'es'}`
                            : 'Empty'}
                          {c.updatedAt ? ` · ${formatDate(c.updatedAt)}` : ''}
                        </p>
                      </div>
                      <ArrowRight
                        size={16}
                        className="shrink-0 text-tertiary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                      />
                    </div>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      </StaggerItem>

      {/* Recent sketches */}
      <StaggerItem>
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">
              Recent sketches
            </h2>
            <Link to="/sketches" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="card overflow-hidden">
            {sketches.length === 0 ? (
              <p className="p-8 m-0 text-secondary text-sm text-center">No sketches yet</p>
            ) : (
              <StaggerList as="div" className="divide-y divide-border" delay={0.2}>
                {sketches.map((s) => (
                  <StaggerRow key={s.id} as="div">
                    <Link
                      to={`/sketches/${s.id}`}
                      className="group flex items-center gap-4 px-5 py-4 text-inherit no-underline hover:bg-hover transition-colors border-l-2 border-transparent hover:border-accent/50"
                    >
                      <span className="flex shrink-0 items-center justify-center w-9 h-9 rounded-md bg-surface text-tertiary group-hover:text-accent group-hover:bg-accent/10 transition-colors">
                        <Music2 size={18} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 mb-0.5 text-[15px] font-medium text-text group-hover:text-accent transition-colors truncate">
                          {s.title}
                        </p>
                        <p className="m-0 text-xs text-tertiary tabular-nums">
                          {formatDuration(s.durationSeconds)}
                          {s.bpm != null ? ` · ${s.bpm} BPM` : ''}
                          {s.collections?.length ? ` · ${s.collections[0].collectionName}` : ''}
                        </p>
                      </div>
                      <ArrowRight
                        size={16}
                        className="shrink-0 text-tertiary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                      />
                    </Link>
                  </StaggerRow>
                ))}
              </StaggerList>
            )}
          </div>
        </section>
      </StaggerItem>
    </Stagger>
  );
}
