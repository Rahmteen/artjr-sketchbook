import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ArrowUpDown } from 'lucide-react';
import { sketchesApi, collectionsApi, tagsApi } from '../api/client';
import type { ApiSketch, ApiCollection } from '../api/client';
import { ViewSwitcher, type ViewMode } from '../components/ui/ViewSwitcher';
import { SketchCard } from '../components/ui/SketchCard';
import { TagPill } from '../components/ui/TagPill';
import { SkeletonTable, SkeletonGrid } from '../components/ui/Skeleton';
import { FadeUp, Stagger, StaggerItem, StaggerList, StaggerRow } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { Select } from '../components/ui/Select';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type SortKey = 'title' | 'updatedAt' | 'durationSeconds' | 'bpm';

export function Sketches() {
  const [sketches, setSketches] = useState<ApiSketch[]>([]);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('updatedAt');
  const [sortDesc, setSortDesc] = useState(true);
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('sketches-view') as ViewMode) || 'table'; }
    catch { return 'table'; }
  });

  useEffect(() => {
    try { localStorage.setItem('sketches-view', viewMode); }
    catch { /* ignore */ }
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    Promise.all([
      sketchesApi.list(tagFilter ? { tagId: tagFilter } : undefined),
      collectionsApi.list(),
      tagsApi.list(),
    ])
      .then(([skList, colList, tagList]) => {
        if (!cancelled) {
          setSketches(skList);
          setCollections(colList);
          setTags(tagList);
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tagFilter]);

  const filtered = collectionFilter
    ? sketches.filter((s) => s.collections?.some((c) => c.collectionId === collectionFilter))
    : sketches;

  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number | undefined;
    let bVal: string | number | undefined;
    switch (sortBy) {
      case 'title': aVal = a.title; bVal = b.title; break;
      case 'updatedAt': aVal = a.updatedAt; bVal = b.updatedAt; break;
      case 'durationSeconds': aVal = a.durationSeconds ?? 0; bVal = b.durationSeconds ?? 0; break;
      case 'bpm': aVal = a.bpm ?? 0; bVal = b.bpm ?? 0; break;
      default: return 0;
    }
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    const diff = Number(aVal) - Number(bVal);
    return sortDesc ? -diff : diff;
  });

  const showSkeleton = useDelayedLoading(loading);

  if (loading && !showSkeleton) return null;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <FadeUp>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">Sketches</h2>
          <div className="flex flex-wrap items-center gap-3">
            <ViewSwitcher mode={viewMode} onChange={setViewMode} />

            <Select
              value={collectionFilter}
              onChange={setCollectionFilter}
              placeholder="All collections"
              options={[
                { value: '', label: 'All collections' },
                ...collections.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />

            <Select
              value={tagFilter}
              onChange={setTagFilter}
              placeholder="All tags"
              options={[
                { value: '', label: 'All tags' },
                ...tags.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />

            <Select
              value={sortBy}
              onChange={(v) => setSortBy(v as SortKey)}
              options={[
                { value: 'updatedAt', label: 'Date' },
                { value: 'title', label: 'Title' },
                { value: 'durationSeconds', label: 'Duration' },
                { value: 'bpm', label: 'BPM' },
              ]}
            />

            <button type="button" onClick={() => setSortDesc((d) => !d)} className="btn text-sm">
              <ArrowUpDown size={14} />
              {sortDesc ? 'Desc' : 'Asc'}
            </button>

            <Link to="/sketches/upload" className="btn btn-primary no-underline">
              <Plus size={16} /> Upload
            </Link>
          </div>
        </div>
      </FadeUp>

      {error && <p className="text-danger text-sm">{error}</p>}

      {/* Loading */}
      {showSkeleton ? (
        viewMode === 'grid' ? <SkeletonGrid count={6} /> : <SkeletonTable rows={5} cols={5} />
      ) : sorted.length === 0 ? (
        <FadeUp delay={0.06}>
          <div className="card p-10 text-center">
            <p className="m-0 text-secondary text-sm">No sketches yet</p>
          </div>
        </FadeUp>
      ) : (
        <>
          {/* Grid view */}
          {viewMode === 'grid' && (
            <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {sorted.map((s) => (
                <StaggerItem key={s.id}>
                  <SketchCard sketch={s} />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {/* List view */}
          {viewMode === 'list' && (
            <StaggerList className="space-y-1">
              {sorted.map((s) => (
                <StaggerRow key={s.id}>
                  <Link
                    to={`/sketches/${s.id}`}
                    className="group flex items-center gap-4 px-5 py-3.5 rounded-md no-underline text-inherit hover:bg-hover transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
                        {s.title}
                      </p>
                      <p className="m-0 mt-0.5 text-xs text-tertiary">
                        {formatDuration(s.durationSeconds)}
                        {s.bpm != null ? ` · ${s.bpm} BPM` : ''}
                        {s.key ? ` · ${s.key}` : ''}
                        {s.collections?.length ? ` · ${s.collections[0].collectionName}` : ''}
                      </p>
                    </div>
                    {s.tags && s.tags.length > 0 && (
                      <div className="flex gap-1.5 shrink-0">
                        {s.tags.slice(0, 2).map((t) => (
                          <TagPill key={t.id} name={t.name} />
                        ))}
                      </div>
                    )}
                  </Link>
                </StaggerRow>
              ))}
            </StaggerList>
          )}

          {/* Table view */}
          {viewMode === 'table' && (
            <FadeUp delay={0.06}>
              <div className="card overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Title</th>
                      <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Duration</th>
                      <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">BPM</th>
                      <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Key</th>
                      <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Collection</th>
                      <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Tags</th>
                    </tr>
                  </thead>
                  <StaggerList as="tbody" className="divide-y divide-border">
                    {sorted.map((s) => (
                      <StaggerRow
                        key={s.id}
                        as="tr"
                        className="row-link"
                        onClick={() => navigate(`/sketches/${s.id}`)}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && navigate(`/sketches/${s.id}`)}
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-text">{s.title}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-secondary tabular-nums">{formatDuration(s.durationSeconds)}</td>
                        <td className="px-6 py-4 text-sm text-secondary">{s.bpm ?? '--'}</td>
                        <td className="px-6 py-4 text-sm text-secondary">{s.key ?? '--'}</td>
                        <td className="px-6 py-4 text-sm text-secondary">{s.collections?.length ? s.collections.map((c) => c.collectionName).join(', ') : '--'}</td>
                        <td className="px-6 py-4">
                          {s.tags?.length ? (
                            <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                              {s.tags.map((t) => (
                                <TagPill key={t.id} name={t.name} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-tertiary">--</span>
                          )}
                        </td>
                      </StaggerRow>
                    ))}
                  </StaggerList>
                </table>
              </div>
            </FadeUp>
          )}
        </>
      )}
    </div>
  );
}
