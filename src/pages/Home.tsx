import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { activitiesApi, collectionsApi, sketchesApi } from '../api/client';
import type { ApiActivity, ApiCollection, ApiSketch } from '../api/client';
import { SkeletonLine } from '../components/ui/Skeleton';
import { Stagger, StaggerItem, StaggerList, StaggerRow } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { ActivityRow } from '../components/ActivityRow';
import { FileCard } from '../components/ui/FileCard';

type GridItem =
  | { type: 'collection'; id: string; label: string; to: string; updatedAt: string }
  | { type: 'sketch'; id: string; label: string; to: string; updatedAt: string };

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}


export function Home() {
  const [activities, setActivities] = useState<ApiActivity[]>([]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [sketches, setSketches] = useState<ApiSketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      activitiesApi.list({ limit: 5, offset: 0 }),
      collectionsApi.list(),
      sketchesApi.list(),
    ])
      .then(([actRes, cols, skList]) => {
        if (cancelled) return;
        setActivities(actRes.activities.slice(0, 5));
        setCollections(cols.slice(0, 8));
        setSketches(skList.slice(0, 16));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = [
      ...collections.map((c) => ({
        type: 'collection' as const,
        id: c.id,
        label: c.name,
        to: `/collections/${c.id}`,
        updatedAt: c.updatedAt ?? c.createdAt ?? new Date(0).toISOString(),
      })),
      ...sketches.map((s) => ({
        type: 'sketch' as const,
        id: s.id,
        label: s.title,
        to: `/sketches/${s.id}`,
        updatedAt: s.updatedAt ?? s.createdAt ?? new Date(0).toISOString(),
      })),
    ];
    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return items.slice(0, 16);
  }, [collections, sketches]);

  const showSkeleton = useDelayedLoading(loading);

  if (loading && !showSkeleton) return null;

  if (showSkeleton) {
    return (
      <div className="space-y-10">
        <section className="space-y-4">
          <SkeletonLine width="120px" height="12px" />
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-1 py-2 flex gap-3">
                <SkeletonLine width="44px" height="12px" />
                <SkeletonLine width="62px" height="12px" />
                <SkeletonLine width="60%" height="12px" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 py-3 px-2">
                <div className="skeleton w-12 h-12 rounded-md" />
                <SkeletonLine width="48px" height="10px" />
              </div>
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
          <div className="overflow-hidden">
            {activities.length === 0 ? (
              <p className="p-6 m-0 text-secondary text-xs text-center">No activity yet</p>
            ) : (
              <StaggerList className="divide-y divide-border" delay={0.1}>
                {activities.slice(0, 5).map((a) => (
                  <StaggerRow key={a.id} className="px-1 py-2 flex items-center gap-3">
                    <span className="text-[11px] text-tertiary shrink-0 tabular-nums whitespace-nowrap w-[44px]">{formatDateLabel(a.createdAt)}</span>
                    <span className="text-[11px] text-tertiary shrink-0 tabular-nums whitespace-nowrap w-[62px]">{formatTime(a.createdAt)}</span>
                    <ActivityRow activity={a} />
                  </StaggerRow>
                ))}
              </StaggerList>
            )}
          </div>
        </section>
      </StaggerItem>

      {/* Unified file grid: collections + sketches mixed by recency */}
      <StaggerItem>
        <section>
          {gridItems.length === 0 ? (
            <p className="py-8 m-0 text-secondary text-xs text-center">No items yet</p>
          ) : (
            <Stagger className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3" delay={0.12}>
              {gridItems.map((item) => (
                <StaggerItem key={item.id}>
                  <FileCard
                    to={item.to}
                    icon={item.type === 'collection' ? 'folder' : 'audio'}
                    label={item.label}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      </StaggerItem>
    </Stagger>
  );
}
