import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type UniqueIdentifier,
  type CollisionDetection,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, Pencil, Plus, MoreHorizontal, Music, GripVertical } from 'lucide-react';
import { collectionsApi } from '../api/client';
import type { ApiCollectionWithTiers, ApiSketch, ApiTier } from '../api/client';
import { SkeletonLine, SkeletonTable } from '../components/ui/Skeleton';
import { TagPill } from '../components/ui/TagPill';
import { FadeUp, StaggerList, StaggerRow } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import { TierManager } from '../components/TierManager';
import { AddSketchesModal } from '../components/AddSketchesModal';
import { getTierColor } from '../components/ui/ColorPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from '../components/ui/Motion';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const UNASSIGNED_ID = 'tier-unassigned';

const customCollision: CollisionDetection = (args) => {
  const activeData = args.active.data.current as { type?: string } | undefined;

  if (activeData?.type === 'sketch') {
    const tierDropOnly = args.droppableContainers.filter(
      (c) => (c.data.current as { type?: string } | undefined)?.type === 'tier-drop'
    );
    return pointerWithin({ ...args, droppableContainers: tierDropOnly });
  }

  const sortableOnly = args.droppableContainers.filter(
    (c) => (c.data.current as { type?: string } | undefined)?.type !== 'tier-drop'
  );
  return closestCenter({ ...args, droppableContainers: sortableOnly });
};

function SketchContextMenu({
  sketch,
  collectionId,
  tiers,
  onAction,
}: {
  sketch: ApiSketch;
  collectionId: string;
  tiers: ApiTier[];
  onAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleMoveTier = async (tierId: string | null) => {
    setOpen(false);
    await collectionsApi.updateSketchInCollection(collectionId, sketch.id, { tierId });
    onAction();
  };

  const handleRemove = async () => {
    setOpen(false);
    await collectionsApi.removeSketch(collectionId, sketch.id);
    window.dispatchEvent(new CustomEvent('collections-updated'));
    onAction();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        className="p-1 rounded-full text-tertiary hover:text-text hover:bg-hover transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="absolute right-0 top-full mt-1 py-1 rounded-md bg-elevated border border-border shadow-modal z-20 min-w-[160px]"
          >
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-tertiary">Move to tier</div>
            <button type="button" onClick={() => handleMoveTier(null)} className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-hover transition-colors">
              Unassigned
            </button>
            {tiers.map((t) => (
              <button key={t.id} type="button" onClick={() => handleMoveTier(t.id)} className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-hover transition-colors">
                {t.label}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <button type="button" onClick={handleRemove} className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-danger-soft transition-colors">
              Remove from collection
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SketchCard({ sketch }: { sketch: ApiSketch }) {
  return (
    <div className="p-3.5">
      <p className="m-0 text-sm font-medium text-text truncate">{sketch.title}</p>
      <p className="m-0 mt-1 text-xs text-tertiary">
        {formatDuration(sketch.durationSeconds)}
        {sketch.bpm != null ? ` · ${sketch.bpm} BPM` : ''}
      </p>
      {sketch.tags && sketch.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {sketch.tags.slice(0, 2).map((t) => (
            <TagPill key={t.id} name={t.name} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableSketchCard({
  sketch,
  collectionId,
  tiers,
  onAction,
}: {
  sketch: ApiSketch;
  collectionId: string;
  tiers: ApiTier[];
  onAction: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sketch.id,
    data: { type: 'sketch', sketch },
  });
  const navigate = useNavigate();

  return (
    <div
      ref={setNodeRef}
      className={`card cursor-grab active:cursor-grabbing transition-opacity group ${isDragging ? 'opacity-30' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-2 p-3.5">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={(e) => { if (!isDragging) { e.stopPropagation(); navigate(`/sketches/${sketch.id}`); } }}
        >
          <p className="m-0 text-sm font-medium text-text truncate hover:text-accent transition-colors">{sketch.title}</p>
          <p className="m-0 mt-1 text-xs text-tertiary">
            {formatDuration(sketch.durationSeconds)}
            {sketch.bpm != null ? ` · ${sketch.bpm} BPM` : ''}
          </p>
          {sketch.tags && sketch.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {sketch.tags.slice(0, 2).map((t) => (
                <TagPill key={t.id} name={t.name} />
              ))}
            </div>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <SketchContextMenu sketch={sketch} collectionId={collectionId} tiers={tiers} onAction={onAction} />
        </div>
      </div>
    </div>
  );
}

function DroppableTierSection({
  tier,
  sketches,
  collectionId,
  allTiers,
  onAction,
}: {
  tier: { id: string; label: string; color: string | null };
  sketches: ApiSketch[];
  collectionId: string;
  allTiers: ApiTier[];
  onAction: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop-${tier.id}`,
    data: { type: 'tier-drop', tierId: tier.id === UNASSIGNED_ID ? null : tier.id },
  });
  const tierColor = getTierColor(tier.color);

  return (
    <div ref={setNodeRef} className="mb-1">
      <div
        className="w-full flex items-center gap-3 px-5 py-3 rounded-md transition-colors"
        style={{
          backgroundColor: tierColor ? tierColor.bg : 'rgb(var(--color-bg-surface))',
          borderLeft: tierColor ? `3px solid ${tierColor.hex}` : '3px solid rgba(255,255,255,0.06)',
        }}
      >
        {tierColor && (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tierColor.hex }} />
        )}
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-text flex-1">{tier.label}</h3>
        <span className="text-[11px] font-medium text-tertiary tabular-nums rounded-full bg-base px-2 py-0.5">{sketches.length}</span>
      </div>

      <div
        className={`min-h-[120px] mt-2 rounded-md border-2 border-dashed transition-colors p-3 ${
          isOver ? 'border-accent bg-accent-soft' : 'border-transparent'
        }`}
      >
        {sketches.length === 0 ? (
          <p className="text-xs text-tertiary/60 text-center py-8 m-0">
            {isOver ? 'Drop here' : 'No sketches — drag here or use context menu'}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sketches.map((s) => (
              <DraggableSketchCard key={s.id} sketch={s} collectionId={collectionId} tiers={allTiers} onAction={onAction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTierSection({
  tier,
  sketches,
  collectionId,
  allTiers,
  onAction,
}: {
  tier: { id: string; label: string; color: string | null; sortOrder?: number };
  sketches: ApiSketch[];
  collectionId: string;
  allTiers: ApiTier[];
  onAction: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tier.id,
    data: { type: 'tier-header' },
  });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `drop-${tier.id}`,
    data: { type: 'tier-drop', tierId: tier.id === UNASSIGNED_ID ? null : tier.id },
  });
  const tierColor = getTierColor(tier.color);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      <div
        className="w-full flex items-center gap-3 px-5 py-3 rounded-md transition-colors"
        style={{
          backgroundColor: tierColor ? tierColor.bg : 'rgb(var(--color-bg-surface))',
          borderLeft: tierColor ? `3px solid ${tierColor.hex}` : '3px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-tertiary hover:text-text shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        {tierColor && (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tierColor.hex }} />
        )}
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-text flex-1">{tier.label}</h3>
        <span className="text-[11px] font-medium text-tertiary tabular-nums rounded-full bg-base px-2 py-0.5">{sketches.length}</span>
      </div>

      <div
        ref={setDropRef}
        className={`min-h-[120px] mt-2 rounded-md border-2 border-dashed transition-colors p-3 ${
          isOver ? 'border-accent bg-accent-soft' : 'border-transparent'
        }`}
      >
        {sketches.length === 0 ? (
          <p className="text-xs text-tertiary/60 text-center py-8 m-0">
            {isOver ? 'Drop here' : 'No sketches — drag here or use context menu'}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sketches.map((s) => (
              <DraggableSketchCard key={s.id} sketch={s} collectionId={collectionId} tiers={allTiers} onAction={onAction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<ApiCollectionWithTiers | null>(null);
  const [sketches, setSketches] = useState<ApiSketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'tier'>('list');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [addSketchesOpen, setAddSketchesOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(null);
  const [localTierOrder, setLocalTierOrder] = useState<string[]>([]);
  const navigate = useNavigate();

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    Promise.all([collectionsApi.get(id), collectionsApi.getSketches(id)])
      .then(([col, skList]) => {
        setCollection(col);
        setSketches(skList);
        setEditName(col.name);
        setLocalTierOrder(col.tiers?.map((t) => t.id) ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    load();
  }, [id, load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || !id) return;

      const activeData = active.data?.current as { type?: string; sketch?: ApiSketch } | undefined;

      if (activeData?.type === 'sketch') {
        const sketchId = active.id as string;
        const overData = over.data?.current as { type?: string; tierId?: string | null } | undefined;
        let targetTierId: string | null = null;

        if (overData?.type === 'tier-drop') {
          targetTierId = overData.tierId ?? null;
        } else if (overData?.type === 'tier-header') {
          const tierIdx = localTierOrder.indexOf(over.id as string);
          targetTierId = tierIdx >= 0 ? (over.id as string) : null;
        } else {
          return;
        }

        const sketch = sketches.find((s) => s.id === sketchId);
        if (!sketch || (sketch.tierId ?? null) === targetTierId) return;

        try {
          await collectionsApi.updateSketchInCollection(id, sketchId, { tierId: targetTierId });
          load();
        } catch {
          setError('Failed to move sketch');
        }
      } else if (activeData?.type === 'tier-header') {
        if (active.id === over.id) return;
        const oldIndex = localTierOrder.indexOf(active.id as string);
        const newIndex = localTierOrder.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(localTierOrder, oldIndex, newIndex);
        setLocalTierOrder(reordered);
        try {
          await collectionsApi.reorderTiers(id, reordered);
          load();
        } catch {
          setError('Failed to reorder tiers');
        }
      }
    },
    [id, sketches, load, localTierOrder]
  );

  const handleSaveName = async () => {
    if (!id || !collection) return;
    setSaving(true);
    try {
      await collectionsApi.update(id, { name: editName.trim() });
      window.dispatchEvent(new CustomEvent('collections-updated'));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const showSkeleton = useDelayedLoading(loading);

  if (!id) return null;
  if (loading && !showSkeleton) return null;

  if (showSkeleton) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <SkeletonLine width="100px" height="14px" />
          <SkeletonLine width="200px" height="24px" />
        </div>
        <SkeletonTable rows={4} cols={3} />
      </div>
    );
  }

  if (error && !collection) return <p className="text-danger">{error}</p>;
  if (!collection) return <p className="text-secondary">Collection not found</p>;

  const tiers: ApiTier[] = collection.tiers ?? [];
  const orderedTiers = localTierOrder
    .map((tid) => tiers.find((t) => t.id === tid))
    .filter((t): t is ApiTier => !!t);

  const sketchesByTier = new Map<string | null, ApiSketch[]>();
  sketchesByTier.set(null, []);
  tiers.forEach((t) => sketchesByTier.set(t.id, []));
  sketches.forEach((s) => {
    const key = s.tierId ?? null;
    const list = sketchesByTier.get(key) ?? sketchesByTier.get(null)!;
    list.push(s);
    if (!sketchesByTier.has(key)) sketchesByTier.set(key, list);
  });

  const activeDragSketch = activeDragId ? sketches.find((s) => s.id === activeDragId) : null;

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/collections" className="inline-flex items-center gap-1 text-sm text-secondary hover:text-text no-underline transition-colors">
              <ChevronLeft size={16} /> Collections
            </Link>
            <h2 className="m-0 text-xl font-bold text-text">{collection.name}</h2>
            <button type="button" onClick={() => setEditOpen(!editOpen)} className="btn btn-ghost text-sm">
              <Pencil size={14} /> Edit
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setAddSketchesOpen(true)} className="btn btn-primary text-sm">
              <Plus size={14} /> Add sketches
            </button>
            <div className="inline-flex items-center gap-0.5 rounded-full bg-surface p-1">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  viewMode === 'list' ? 'bg-accent-soft text-accent' : 'text-secondary hover:text-text'
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tier')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  viewMode === 'tier' ? 'bg-accent-soft text-accent' : 'text-secondary hover:text-text'
                }`}
              >
                Tier view
              </button>
            </div>
          </div>
        </div>
      </FadeUp>

      {error && <p className="text-danger text-sm">{error}</p>}

      {editOpen && (
        <div className="card p-6 space-y-4">
          <h3 className="m-0 text-sm font-semibold text-text">Edit collection</h3>
          <div>
            <label className="block text-xs font-medium text-tertiary mb-1.5">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="form-input w-full"
            />
          </div>
          <TierManager collectionId={id} tiers={tiers} onTiersChanged={load} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditOpen(false)} className="btn">Cancel</button>
            <button type="button" onClick={handleSaveName} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        <FadeUp delay={0.08}>
          <div className="card overflow-hidden">
            {sketches.length === 0 ? (
              <div className="p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-14 h-14 rounded-md bg-accent-soft flex items-center justify-center">
                  <Music size={24} className="text-accent" />
                </div>
                <div>
                  <p className="m-0 text-base font-semibold text-text">Add your first sketch</p>
                  <p className="m-0 mt-1.5 text-sm text-secondary max-w-xs">
                    Start building this collection by adding sketches from your library.
                  </p>
                </div>
                <button type="button" onClick={() => setAddSketchesOpen(true)} className="btn btn-primary">
                  <Plus size={14} /> Add sketches
                </button>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Title</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Duration</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Tier</th>
                    <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-tertiary w-10" />
                  </tr>
                </thead>
                <StaggerList as="tbody" className="divide-y divide-border">
                  {sketches.map((s) => {
                    const tierColor = getTierColor(tiers.find((t) => t.id === s.tierId)?.color ?? null);
                    return (
                      <StaggerRow
                        key={s.id}
                        as="tr"
                        className="row-link group"
                        onClick={() => navigate(`/sketches/${s.id}`)}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && navigate(`/sketches/${s.id}`)}
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-text">{s.title}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-secondary">{formatDuration(s.durationSeconds)}</td>
                        <td className="px-6 py-4 text-sm text-secondary">
                          {s.tierLabel ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-xs">
                              {tierColor && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tierColor.hex }} />}
                              {s.tierLabel}
                            </span>
                          ) : '--'}
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <SketchContextMenu sketch={s} collectionId={id} tiers={tiers} onAction={load} />
                        </td>
                      </StaggerRow>
                    );
                  })}
                </StaggerList>
              </table>
            )}
          </div>
        </FadeUp>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={customCollision}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {sketches.length === 0 && tiers.length === 0 ? (
            <FadeUp delay={0.08}>
              <div className="card p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-14 h-14 rounded-md bg-accent-soft flex items-center justify-center">
                  <Music size={24} className="text-accent" />
                </div>
                <div>
                  <p className="m-0 text-base font-semibold text-text">Add your first sketch</p>
                  <p className="m-0 mt-1.5 text-sm text-secondary max-w-xs">
                    Create tiers and add sketches to organize your collection.
                  </p>
                </div>
                <button type="button" onClick={() => setAddSketchesOpen(true)} className="btn btn-primary">
                  <Plus size={14} /> Add sketches
                </button>
              </div>
            </FadeUp>
          ) : (
            <FadeUp delay={0.08}>
              <div className="space-y-2">
                <SortableContext items={localTierOrder} strategy={verticalListSortingStrategy}>
                  {orderedTiers.map((tier) => (
                    <SortableTierSection
                      key={tier.id}
                      tier={tier}
                      sketches={sketchesByTier.get(tier.id) ?? []}
                      collectionId={id}
                      allTiers={tiers}
                      onAction={load}
                    />
                  ))}
                </SortableContext>
                <DroppableTierSection
                  tier={{ id: UNASSIGNED_ID, label: 'Unassigned', color: null }}
                  sketches={sketchesByTier.get(null) ?? []}
                  collectionId={id}
                  allTiers={tiers}
                  onAction={load}
                />
              </div>
            </FadeUp>
          )}

          <DragOverlay>
            {activeDragSketch ? (
              <div className="card w-[200px] opacity-90 shadow-modal rotate-2">
                <SketchCard sketch={activeDragSketch} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {addSketchesOpen && (
        <AddSketchesModal
          collectionId={id}
          existingSketchIds={sketches.map((s) => s.id)}
          onClose={() => setAddSketchesOpen(false)}
          onAdded={load}
        />
      )}
    </div>
  );
}
