import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { collectionsApi } from '../api/client';
import type { ApiCollection } from '../api/client';
import { SkeletonTable } from '../components/ui/Skeleton';
import { FadeUp, StaggerList, StaggerRow } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Collections() {
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    collectionsApi
      .list()
      .then((list) => { if (!cancelled) setCollections(list); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const col = await collectionsApi.create(name);
      setNewName('');
      setCreating(false);
      window.dispatchEvent(new CustomEvent('collections-updated'));
      navigate(`/collections/${col.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const showSkeleton = useDelayedLoading(loading);

  if (loading && !showSkeleton) return null;

  if (showSkeleton) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="skeleton w-24 h-3 rounded" />
          <div className="skeleton w-32 h-9 rounded-full" />
        </div>
        <SkeletonTable rows={4} cols={2} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">Collections</h2>
          {!creating ? (
            <button type="button" onClick={() => setCreating(true)} className="btn btn-primary">
              <Plus size={16} /> New collection
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name"
                className="form-input w-64"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <button type="button" onClick={handleCreate} className="btn btn-primary">Create</button>
              <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className="btn">Cancel</button>
            </div>
          )}
        </div>
      </FadeUp>

      {error && <p className="text-danger text-sm">{error}</p>}

      <FadeUp delay={0.08}>
        <div className="card overflow-hidden">
          {collections.length === 0 ? (
            <p className="p-10 m-0 text-secondary text-sm text-center">
              No collections yet
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Name</th>
                  <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Sketches</th>
                  <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Updated</th>
                </tr>
              </thead>
              <StaggerList as="tbody" className="divide-y divide-border">
                {collections.map((c) => (
                  <StaggerRow
                    key={c.id}
                    as="tr"
                    className="row-link"
                    onClick={() => navigate(`/collections/${c.id}`)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && navigate(`/collections/${c.id}`)}
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-text">{c.name}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-secondary tabular-nums">{c.sketchCount ?? 0}</td>
                    <td className="px-6 py-4 text-sm text-secondary">{formatDate(c.updatedAt)}</td>
                  </StaggerRow>
                ))}
              </StaggerList>
            </table>
          )}
        </div>
      </FadeUp>
    </div>
  );
}
