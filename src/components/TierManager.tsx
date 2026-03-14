import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Plus } from 'lucide-react';
import { collectionsApi } from '../api/client';
import type { ApiTier } from '../api/client';
import { ColorPicker, getTierColor } from './ui/ColorPicker';

interface TierManagerProps {
  collectionId: string;
  tiers: ApiTier[];
  onTiersChanged: () => void;
}

function SortableTierRow({
  tier,
  collectionId,
  onTiersChanged,
}: {
  tier: ApiTier;
  collectionId: string;
  onTiersChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tier.id });
  const [label, setLabel] = useState(tier.label);
  const [renaming, setRenaming] = useState(false);
  const color = getTierColor(tier.color);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRename = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === tier.label) { setLabel(tier.label); setRenaming(false); return; }
    await collectionsApi.tiers.update(collectionId, tier.id, { label: trimmed });
    setRenaming(false);
    onTiersChanged();
  };

  const handleColorChange = async (colorKey: string | null) => {
    await collectionsApi.tiers.update(collectionId, tier.id, { color: colorKey });
    onTiersChanged();
  };

  const handleDelete = async () => {
    await collectionsApi.tiers.delete(collectionId, tier.id);
    onTiersChanged();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-surface group"
    >
      <button type="button" className="cursor-grab active:cursor-grabbing text-tertiary hover:text-text shrink-0" {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>

      <ColorPicker value={tier.color} onChange={handleColorChange} />

      {renaming ? (
        <input
          autoFocus
          className="form-input text-sm flex-1 py-1"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setLabel(tier.label); setRenaming(false); } }}
        />
      ) : (
        <button type="button" onClick={() => setRenaming(true)} className="flex-1 text-left text-sm font-medium text-text hover:text-accent transition-colors truncate">
          <span className="flex items-center gap-2">
            {color && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color.hex }} />}
            {tier.label}
          </span>
        </button>
      )}

      <span className="text-xs text-tertiary tabular-nums shrink-0">{tier.sketchCount ?? 0}</span>

      <button
        type="button"
        onClick={handleDelete}
        className="shrink-0 p-1 rounded-full text-tertiary hover:text-danger hover:bg-danger-soft transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Delete tier ${tier.label}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TierManager({ collectionId, tiers, onTiersChanged }: TierManagerProps) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [localTiers, setLocalTiers] = useState(tiers);

  if (localTiers !== tiers && tiers.length !== localTiers.length) {
    setLocalTiers(tiers);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localTiers.findIndex((t) => t.id === active.id);
    const newIndex = localTiers.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(localTiers, oldIndex, newIndex);
    setLocalTiers(reordered);

    await collectionsApi.reorderTiers(collectionId, reordered.map((t) => t.id));
    onTiersChanged();
  };

  const handleAddTier = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) { setAdding(false); return; }
    await collectionsApi.tiers.create(collectionId, trimmed);
    setNewLabel('');
    setAdding(false);
    onTiersChanged();
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-tertiary mb-1.5">Tiers</label>
      {localTiers.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localTiers.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {localTiers.map((tier) => (
                <SortableTierRow
                  key={tier.id}
                  tier={tier}
                  collectionId={collectionId}
                  onTiersChanged={onTiersChanged}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-xs text-tertiary py-2 m-0">No tiers yet</p>
      )}

      {adding ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="form-input text-sm flex-1 py-1.5"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTier(); if (e.key === 'Escape') { setNewLabel(''); setAdding(false); } }}
            placeholder="Tier name"
          />
          <button type="button" onClick={handleAddTier} className="btn btn-primary text-sm py-1.5">Add</button>
          <button type="button" onClick={() => { setNewLabel(''); setAdding(false); }} className="btn text-sm py-1.5">Cancel</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline transition-colors"
        >
          <Plus size={14} /> Add tier
        </button>
      )}
    </div>
  );
}
