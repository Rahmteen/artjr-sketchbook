import { useEffect, useState } from 'react';
import { activitiesApi } from '../api/client';
import type { ApiActivity } from '../api/client';
import { SkeletonLine } from '../components/ui/Skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FadeUp, StaggerList, StaggerRow } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { ActivityRow } from '../components/ActivityRow';
import { Select } from '../components/ui/Select';

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const PAGE_SIZE = 20;

const ENTITY_TYPES = [
  { value: '', label: 'All entities' },
  { value: 'sketch', label: 'Sketches' },
  { value: 'collection', label: 'Collections' },
];

const ACTION_TYPES = [
  { value: '', label: 'All actions' },
  { value: 'upload', label: 'Upload' },
  { value: 'delete', label: 'Delete' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'rename', label: 'Rename' },
  { value: 'tier_move', label: 'Tier move' },
  { value: 'sketches_added', label: 'Added to collection' },
  { value: 'tags_updated', label: 'Tags updated' },
];

const DATE_RANGES = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export function Timeline() {
  const [data, setData] = useState<{ activities: ApiActivity[]; total: number }>({ activities: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateRange, setDateRange] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    let startDate: string | undefined;
    if (dateRange) {
      const d = new Date();
      d.setDate(d.getDate() - Number(dateRange));
      startDate = d.toISOString();
    }

    activitiesApi
      .list({
        limit: PAGE_SIZE,
        offset,
        entityType: entityFilter || undefined,
        actionType: actionFilter || undefined,
        startDate,
      })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [offset, entityFilter, actionFilter, dateRange]);

  useEffect(() => { setOffset(0); }, [entityFilter, actionFilter, dateRange]);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const pageIndex = Math.floor(offset / PAGE_SIZE);
  const showSkeleton = useDelayedLoading(loading);

  if (loading && !showSkeleton) return null;

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">Timeline</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={entityFilter} onChange={setEntityFilter} options={ENTITY_TYPES} placeholder="All entities" />
            <Select value={actionFilter} onChange={setActionFilter} options={ACTION_TYPES} placeholder="All actions" />
            <Select value={dateRange} onChange={setDateRange} options={DATE_RANGES} placeholder="All time" />
          </div>
        </div>
      </FadeUp>

      {error && <p className="text-danger">{error}</p>}

      {showSkeleton ? (
        <div className="card overflow-hidden divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-2 flex gap-3">
              <SkeletonLine width="44px" height="12px" />
              <SkeletonLine width="62px" height="12px" />
              <SkeletonLine width="60%" height="12px" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <FadeUp delay={0.06}>
            <div className="card overflow-hidden">
              {data.activities.length === 0 ? (
                <p className="p-6 m-0 text-secondary text-xs text-center">No activity yet</p>
              ) : (
                <StaggerList className="divide-y divide-border">
                  {data.activities.map((a) => (
                    <StaggerRow key={a.id} className="px-4 py-2 flex items-center gap-3">
                      <span className="text-[11px] text-tertiary shrink-0 tabular-nums whitespace-nowrap w-[44px]">{formatDateLabel(a.createdAt)}</span>
                      <span className="text-[11px] text-tertiary shrink-0 tabular-nums whitespace-nowrap w-[62px]">{formatTime(a.createdAt)}</span>
                      <ActivityRow activity={a} />
                    </StaggerRow>
                  ))}
                </StaggerList>
              )}
            </div>
          </FadeUp>
          {totalPages > 1 && (
            <FadeUp delay={0.12}>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  className="btn"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className="text-sm text-secondary tabular-nums">
                  Page {pageIndex + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= data.total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  className="btn"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </FadeUp>
          )}
        </>
      )}
    </div>
  );
}
