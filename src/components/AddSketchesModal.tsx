import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2 } from 'lucide-react';
import { sketchesApi, collectionsApi } from '../api/client';
import type { ApiSketch } from '../api/client';
import { TagPill } from './ui/TagPill';
import { EASE_OUT_EXPO } from './ui/Motion';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AddSketchesModalProps {
  collectionId: string;
  existingSketchIds: string[];
  onClose: () => void;
  onAdded: () => void;
}

export function AddSketchesModal({ collectionId, existingSketchIds, onClose, onAdded }: AddSketchesModalProps) {
  const [allSketches, setAllSketches] = useState<ApiSketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sketchesApi.list()
      .then(setAllSketches)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const existing = useMemo(() => new Set(existingSketchIds), [existingSketchIds]);

  const available = useMemo(() => {
    const filtered = allSketches.filter((s) => !existing.has(s.id));
    if (!search.trim()) return filtered;
    const q = search.trim().toLowerCase();
    return filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.tags?.some((t) => t.name.toLowerCase().includes(q))
    );
  }, [allSketches, existing, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true); setError(null);
    try {
      await collectionsApi.addSketches(collectionId, [...selected]);
      window.dispatchEvent(new CustomEvent('collections-updated'));
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sketches');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm z-[100]"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal w-full max-w-[520px] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT_EXPO, delay: 0.04 }}
      >
        <div className="px-5 pt-5 pb-3 space-y-3 shrink-0">
          <h2 className="text-base font-bold text-text m-0">Add sketches</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sketches..."
              className="form-input w-full pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-accent" />
            </div>
          ) : available.length === 0 ? (
            <p className="text-sm text-tertiary text-center py-10 m-0">
              {search.trim() ? 'No matching sketches' : 'All sketches are already in this collection'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {available.map((s) => {
                const isSelected = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
                      isSelected ? 'bg-accent-soft' : 'hover:bg-hover'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-accent border-accent' : 'border-border'
                    }`}>
                      {isSelected && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`m-0 text-sm font-medium truncate ${isSelected ? 'text-accent' : 'text-text'}`}>{s.title}</p>
                      <p className="m-0 text-xs text-tertiary">
                        {formatDuration(s.durationSeconds)}
                        {s.bpm != null ? ` · ${s.bpm} BPM` : ''}
                      </p>
                    </div>
                    {s.tags && s.tags.length > 0 && (
                      <div className="flex gap-1 shrink-0">
                        {s.tags.slice(0, 2).map((t) => (
                          <TagPill key={t.id} name={t.name} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger px-5 m-0">{error}</p>}

        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
          <span className="text-sm text-secondary">
            {selected.size > 0 ? `${selected.size} selected` : 'Select sketches to add'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={selected.size === 0 || saving}
              className="btn btn-primary"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : `Add ${selected.size > 0 ? `(${selected.size})` : ''}`}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
