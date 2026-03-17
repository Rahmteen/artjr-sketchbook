import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { collectionsApi } from '../api/client';
import type { ApiCollection } from '../api/client';
import { SkeletonLine } from '../components/ui/Skeleton';
import { FadeUp, Stagger, StaggerItem } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { FileCard } from '../components/ui/FileCard';

export function Collections() {
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
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
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 py-3 px-2">
              <div className="skeleton w-12 h-12 rounded-md" />
              <SkeletonLine width="48px" height="10px" />
            </div>
          ))}
        </div>
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
        {collections.length === 0 ? (
          <p className="p-10 m-0 text-secondary text-sm text-center">No collections yet</p>
        ) : (
          <Stagger className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {collections.map((c) => (
              <StaggerItem key={c.id}>
                <FileCard to={`/collections/${c.id}`} icon="folder" label={c.name} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </FadeUp>
    </div>
  );
}
