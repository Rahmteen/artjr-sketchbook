import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Upload, Loader2, X } from 'lucide-react';
import { shareApi, sketchesApi, uploadApi, collectionsApi } from '../api/client';
import type { ApiSketch, ApiCollection } from '../api/client';
import { useSketchStore } from '../stores/sketchStore';
import { EASE_OUT_EXPO } from './ui/Motion';
import { Select } from './ui/Select';

export type SettingsView = 'menu' | 'copy' | 'newVersion' | 'editDetails' | 'manageCollections' | 'delete';

interface SketchSettingsModalProps {
  sketch: ApiSketch;
  onClose: () => void;
  onSketchUpdated: (s: ApiSketch) => void;
}

export function SketchSettingsModal({ sketch, onClose, onSketchUpdated }: SketchSettingsModalProps) {
  const navigate = useNavigate();
  const { removeSketch, addSketch } = useSketchStore();
  const [view, setView] = useState<SettingsView>('menu');
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    title: sketch.title,
    description: sketch.description ?? '',
    bpm: sketch.bpm != null ? String(sketch.bpm) : '',
    key: sketch.key ?? '',
    versionLabel: sketch.versionLabel ?? '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionDragover, setVersionDragover] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collections management state
  const [allCollections, setAllCollections] = useState<ApiCollection[]>([]);
  const [sketchCollections, setSketchCollections] = useState(sketch.collections ?? []);
  const [addCollectionId, setAddCollectionId] = useState('');
  const [collectionSaving, setCollectionSaving] = useState(false);

  useEffect(() => { collectionsApi.list().then(setAllCollections).catch(() => {}); }, []);
  useEffect(() => { setSketchCollections(sketch.collections ?? []); }, [sketch.collections]);
  useEffect(() => {
    setEditForm({ title: sketch.title, description: sketch.description ?? '', bpm: sketch.bpm != null ? String(sketch.bpm) : '', key: sketch.key ?? '', versionLabel: sketch.versionLabel ?? '' });
  }, [sketch]);

  const handleCopyLink = async () => {
    setEditError(null);
    try {
      const { shareUrl } = await shareApi.create(sketch.id);
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      const t = setTimeout(() => setCopied(false), 1600);
      return () => clearTimeout(t);
    } catch { setEditError('Failed to create share link'); }
  };

  const handleNewVersionConfirm = async () => {
    if (!versionFile) { setVersionError('Please add an audio file'); return; }
    setVersionLoading(true); setVersionError(null);
    const formData = new FormData();
    formData.append('file', versionFile);
    formData.append('title', sketch.title);
    formData.append('parentSketchId', sketch.id);
    try {
      const newSketch = await uploadApi.sketch(formData);
      addSketch(newSketch);
      onClose();
      navigate(`/sketches/${newSketch.id}`);
    } catch (err) { setVersionError(err instanceof Error ? err.message : 'Upload failed'); }
    finally { setVersionLoading(false); }
  };

  const handleEditSave = async () => {
    setEditSaving(true); setEditError(null);
    try {
      const updated = await sketchesApi.patch(sketch.id, {
        title: editForm.title || undefined,
        description: editForm.description || undefined,
        bpm: editForm.bpm ? Number(editForm.bpm) : undefined,
        key: editForm.key || undefined,
        versionLabel: editForm.versionLabel || undefined,
      });
      onSketchUpdated(updated);
      setView('menu');
      onClose();
    } catch (err) { setEditError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setEditSaving(false); }
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true); setEditError(null);
    try {
      await sketchesApi.delete(sketch.id);
      removeSketch(sketch.id);
      onClose();
      navigate('/sketches');
    } catch (err) { setEditError(err instanceof Error ? err.message : 'Delete failed'); }
    finally { setDeleteLoading(false); }
  };

  const handleAddToCollection = async () => {
    if (!addCollectionId) return;
    setCollectionSaving(true); setEditError(null);
    try {
      await collectionsApi.addSketches(addCollectionId, [sketch.id]);
      const updated = await sketchesApi.get(sketch.id);
      onSketchUpdated(updated);
      setSketchCollections(updated.collections ?? []);
      setAddCollectionId('');
      window.dispatchEvent(new CustomEvent('collections-updated'));
    } catch (err) { setEditError(err instanceof Error ? err.message : 'Failed to add'); }
    finally { setCollectionSaving(false); }
  };

  const handleRemoveFromCollection = async (collectionId: string) => {
    setCollectionSaving(true); setEditError(null);
    try {
      await collectionsApi.removeSketch(collectionId, sketch.id);
      const updated = await sketchesApi.get(sketch.id);
      onSketchUpdated(updated);
      setSketchCollections(updated.collections ?? []);
      window.dispatchEvent(new CustomEvent('collections-updated'));
    } catch (err) { setEditError(err instanceof Error ? err.message : 'Failed to remove'); }
    finally { setCollectionSaving(false); }
  };

  const handleBack = () => { setView('menu'); setDeleteConfirm(false); setEditError(null); setVersionError(null); };

  const versionDrop = (e: React.DragEvent) => {
    e.preventDefault(); setVersionDragover(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('audio/')) setVersionFile(f);
  };

  const menuBtn = 'btn w-full justify-start text-left';

  const availableCollections = allCollections.filter(
    (c) => !sketchCollections.some((sc) => sc.collectionId === c.id)
  );

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm z-[100]"
      role="dialog" aria-modal="true" aria-labelledby="settings-modal-title"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal w-full max-w-[400px] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT_EXPO, delay: 0.04 }}
      >

        {view === 'menu' && (
          <>
            <h2 id="settings-modal-title" className="sr-only">Settings</h2>
            <div className="px-5 pb-5 pt-5 flex flex-col gap-1.5">
              <button type="button" onClick={handleCopyLink} className={menuBtn}>
                {copied ? <span className="animate-copied inline-block">Copied!</span> : 'Copy shareable link'}
              </button>
              <button type="button" onClick={() => setView('newVersion')} className={menuBtn}>Add a new version</button>
              <button type="button" onClick={() => setView('editDetails')} className={menuBtn}>Edit details</button>
              <button type="button" onClick={() => setView('manageCollections')} className={menuBtn}>Manage collections</button>

              {deleteLoading ? (
                <div className="btn w-full justify-center opacity-50 pointer-events-none">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span className="text-secondary">Deleting...</span>
                </div>
              ) : deleteConfirm ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-secondary px-1 m-0">Are you sure?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleDeleteConfirm} className="btn btn-danger flex-1">Yes, delete</button>
                    <button type="button" onClick={() => setDeleteConfirm(false)} className="btn flex-1">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setDeleteConfirm(true)} className="btn btn-danger w-full justify-start text-left">
                  Delete
                </button>
              )}
            </div>
          </>
        )}

        {view === 'newVersion' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="inline-flex items-center gap-1 text-secondary hover:text-text transition-colors text-sm" aria-label="Back">
                <ChevronLeft size={16} /> Back
              </button>
              <h2 className="text-base font-bold text-text m-0">New version</h2>
              <span className="w-16" />
            </div>
            <p className="text-sm text-secondary m-0">
              New version for <strong className="text-text">v{sketch.version}{sketch.versionLabel ? ` · ${sketch.versionLabel}` : ''}</strong>
            </p>
            <div
              className={`flex flex-col items-center justify-center gap-2 min-h-[120px] p-6 rounded-md border-2 border-dashed cursor-pointer transition-all ${
                versionDragover ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent/50 hover:bg-accent/[0.075]'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={versionDrop}
              onDragOver={(e) => { e.preventDefault(); setVersionDragover(true); }}
              onDragLeave={() => setVersionDragover(false)}
            >
              <input ref={fileInputRef} type="file" accept="audio/*" onChange={(e) => setVersionFile(e.target.files?.[0] ?? null)} className="sr-only" aria-label="Add audio file" />
              <Upload size={20} className="text-tertiary" />
              <span className="text-sm font-medium text-text">{versionFile ? versionFile.name : 'Add audio file'}</span>
            </div>
            {versionError && <p className="text-sm text-danger m-0">{versionError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setVersionFile(null); setVersionError(null); setView('menu'); }} className="btn flex-1">Cancel</button>
              <button type="button" onClick={handleNewVersionConfirm} disabled={!versionFile || versionLoading} className="btn btn-primary flex-1">
                {versionLoading ? 'Uploading...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {view === 'editDetails' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="inline-flex items-center gap-1 text-secondary hover:text-text transition-colors text-sm" aria-label="Back">
                <ChevronLeft size={16} /> Back
              </button>
              <h2 className="text-base font-bold text-text m-0">Edit details</h2>
              <span className="w-16" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block mb-1.5 text-xs font-medium text-tertiary">Name</label>
                <input className="form-input" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title" />
              </div>
              <div>
                <label className="block mb-1.5 text-xs font-medium text-tertiary">Description</label>
                <textarea className="form-input min-h-[72px] resize-y" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1.5 text-xs font-medium text-tertiary">BPM</label>
                  <input type="number" className="form-input" value={editForm.bpm} onChange={(e) => setEditForm((f) => ({ ...f, bpm: e.target.value }))} />
                </div>
                <div>
                  <label className="block mb-1.5 text-xs font-medium text-tertiary">Key</label>
                  <input className="form-input" value={editForm.key} onChange={(e) => setEditForm((f) => ({ ...f, key: e.target.value }))} placeholder="Cm" />
                </div>
              </div>
              <div>
                <label className="block mb-1.5 text-xs font-medium text-tertiary">Version label</label>
                <input className="form-input" value={editForm.versionLabel} onChange={(e) => setEditForm((f) => ({ ...f, versionLabel: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            {editError && <p className="text-sm text-danger m-0">{editError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={handleBack} className="btn flex-1">Cancel</button>
              <button type="button" onClick={handleEditSave} disabled={editSaving} className="btn btn-primary flex-1">
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {view === 'manageCollections' && (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="inline-flex items-center gap-1 text-secondary hover:text-text transition-colors text-sm" aria-label="Back">
                <ChevronLeft size={16} /> Back
              </button>
              <h2 className="text-base font-bold text-text m-0">Collections</h2>
              <span className="w-16" />
            </div>

            {sketchCollections.length > 0 ? (
              <div className="space-y-1.5">
                {sketchCollections.map((sc) => (
                  <div key={sc.collectionId} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md bg-surface">
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-medium text-text truncate">{sc.collectionName}</p>
                      {sc.tierLabel && <p className="m-0 text-xs text-tertiary">{sc.tierLabel}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCollection(sc.collectionId)}
                      disabled={collectionSaving}
                      className="shrink-0 p-1.5 rounded-full text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                      aria-label={`Remove from ${sc.collectionName}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-tertiary m-0 text-center py-3">Not in any collection</p>
            )}

            {availableCollections.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  value={addCollectionId}
                  onChange={setAddCollectionId}
                  placeholder="Add to collection..."
                  className="flex-1"
                  options={availableCollections.map((c) => ({ value: c.id, label: c.name }))}
                />
                <button
                  type="button"
                  onClick={handleAddToCollection}
                  disabled={!addCollectionId || collectionSaving}
                  className="btn btn-primary shrink-0"
                >
                  {collectionSaving ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
                </button>
              </div>
            )}

            {editError && <p className="text-sm text-danger m-0">{editError}</p>}
          </div>
        )}

        {(view === 'menu' && editError) && <p className="text-sm text-danger px-5 pb-2 m-0">{editError}</p>}
      </motion.div>
    </motion.div>
  );
}
