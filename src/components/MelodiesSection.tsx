import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Volume2,
  VolumeX,
  Headphones,
  Trash2,
  Loader2,
  Upload,
  Pencil,
  Music2,
} from 'lucide-react';
import { melodiesApi } from '../api/client';
import type { ApiMelody } from '../api/client';
import type { AudioEngine } from '../lib/audioEngine';
import { getTierColor } from './ui/ColorPicker';
import { FadeUp } from './ui/Motion';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from './ui/Motion';

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const formatOffset = (ms: number) => {
  const sign = ms >= 0 ? '+' : '';
  if (Math.abs(ms) >= 1000) return `${sign}${(ms / 1000).toFixed(1)}s`;
  return `${sign}${Math.round(ms)}ms`;
};

export interface MelodiesTransport {
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  loopMode: 'off' | 'once' | 'infinite';
  setLoopMode: (m: 'off' | 'once' | 'infinite') => void;
  setMainVolume: (vol: number) => void;
}

interface MelodiesSectionProps {
  sketchId: string;
  sketchDuration: number;
  melodies: ApiMelody[];
  onMelodiesChange: (melodies: ApiMelody[]) => void;
  melodyModeActive: boolean;
  onMelodyModeChange: (active: boolean) => void;
  engineRef?: React.MutableRefObject<AudioEngine | null>;
  transport?: MelodiesTransport;
}

export function MelodiesSection({
  sketchId,
  sketchDuration: _sketchDuration,
  melodies,
  onMelodiesChange,
  melodyModeActive,
  onMelodyModeChange,
  engineRef: externalEngineRef,
  transport,
}: MelodiesSectionProps) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [soloId, setSoloId] = useState<string | null>(null);
  const [editingOffset, setEditingOffset] = useState<string | null>(null);
  const [offsetInput, setOffsetInput] = useState('');
  const [mainVolume, setMainVolume] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMelodies = useCallback(() => {
    melodiesApi.list(sketchId).then((list) => { onMelodiesChange(list); setLoading(false); }).catch(() => setLoading(false));
  }, [sketchId, onMelodiesChange]);

  useEffect(() => { loadMelodies(); }, [loadMelodies]);

  const defaultSelectedId = useMemo(() => {
    const sorted = [...melodies].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted[0]?.id ?? null;
  }, [melodies]);

  const handleMelodyModeToggle = () => {
    const next = !melodyModeActive;
    onMelodyModeChange(next);
    const engine = externalEngineRef?.current;
    if (!engine) return;
    if (next) {
      const nextMuted: Record<string, boolean> = {};
      melodies.forEach((mel) => {
        const m = mel.id !== defaultSelectedId;
        nextMuted[mel.id] = m;
        engine.muteTrack(mel.id, m);
      });
      setMuted((prev) => ({ ...prev, ...nextMuted }));
    } else {
      melodies.forEach((mel) => engine.muteTrack(mel.id, true));
      setMuted((prev) => {
        const nextMuted = { ...prev };
        melodies.forEach((mel) => { nextMuted[mel.id] = true; });
        return nextMuted;
      });
    }
  };

  const handleVolumeChange = (melId: string, vol: number) => {
    setVolumes((prev) => ({ ...prev, [melId]: vol }));
    externalEngineRef?.current?.setTrackVolume(melId, vol);
  };

  const handleMuteToggle = (melId: string) => {
    setMuted((prev) => {
      const next = { ...prev, [melId]: !prev[melId] };
      externalEngineRef?.current?.muteTrack(melId, next[melId]);
      return next;
    });
  };

  const handleSoloToggle = (melId: string) => {
    const newSolo = soloId === melId ? null : melId;
    setSoloId(newSolo);
    externalEngineRef?.current?.soloTrack(newSolo);
  };

  const handleMainVolumeChange = (vol: number) => {
    setMainVolume(vol);
    transport?.setMainVolume(vol);
  };

  const handleOffsetSave = async (melId: string) => {
    const ms = parseFloat(offsetInput);
    if (isNaN(ms)) { setEditingOffset(null); return; }
    await melodiesApi.patch(melId, { offsetMs: ms });
    externalEngineRef?.current?.updateTrackOffset(melId, ms);
    setEditingOffset(null);
    loadMelodies();
  };

  const handleDelete = async (melId: string) => {
    externalEngineRef?.current?.removeTrack(melId);
    await melodiesApi.delete(melId);
    onMelodiesChange(melodies.filter((m) => m.id !== melId));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('label', file.name.replace(/\.[^.]+$/, ''));
      const mel = await melodiesApi.upload(sketchId, formData);
      onMelodiesChange([...melodies, mel]);
      setUploadOpen(false);
    } catch {
      /* handled */
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLabelEdit = async (melId: string, label: string) => {
    if (!label.trim()) return;
    await melodiesApi.patch(melId, { label: label.trim() });
    loadMelodies();
  };

  if (loading) return null;

  return (
    <FadeUp delay={0.1}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-tertiary">Melodies</h3>
          <button type="button" onClick={() => setUploadOpen(true)} className="btn text-sm">
            <Plus size={14} /> Add melody
          </button>
        </div>

        {melodies.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="m-0 text-sm text-secondary">No melodies yet. Add vocal takes or instrument layers to overlay with this sketch.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transport && (
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={handleMelodyModeToggle}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    melodyModeActive ? 'bg-accent-soft text-accent' : 'text-secondary hover:text-text bg-surface'
                  }`}
                >
                  <Music2 size={14} />
                  {melodyModeActive ? 'Melodies on' : 'Melodies off'}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-tertiary">Main</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={mainVolume}
                    onChange={(e) => handleMainVolumeChange(parseFloat(e.target.value))}
                    className="w-24 h-1 accent-accent"
                  />
                </div>
              </div>
            )}

            {/* Track list */}
            <div className="space-y-1">
              {melodies.map((mel) => {
                const color = getTierColor(mel.color);
                const isMuted = muted[mel.id] ?? false;
                const isSolo = soloId === mel.id;
                const vol = volumes[mel.id] ?? 1;

                return (
                  <div key={mel.id} className="card p-4 transition-colors">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color?.hex ?? '#71717A' }}
                      />
                      <MelodyLabel mel={mel} onSave={handleLabelEdit} />
                      <span className="text-xs text-tertiary tabular-nums shrink-0">
                        {formatTime((mel.durationSeconds ?? 0))}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      {/* Volume */}
                      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                        <button
                          type="button"
                          onClick={() => handleMuteToggle(mel.id)}
                          className={`shrink-0 p-1 rounded-full transition-colors ${isMuted ? 'text-danger' : 'text-secondary hover:text-text'}`}
                          aria-label={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={vol}
                          onChange={(e) => handleVolumeChange(mel.id, parseFloat(e.target.value))}
                          className="flex-1 h-1 accent-accent"
                        />
                      </div>

                      {/* Solo */}
                      <button
                        type="button"
                        onClick={() => handleSoloToggle(mel.id)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                          isSolo ? 'bg-accent-soft text-accent' : 'text-tertiary hover:text-text hover:bg-hover'
                        }`}
                      >
                        <Headphones size={12} className="inline mr-1" />
                        Solo
                      </button>

                      {/* Offset */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-tertiary">Offset:</span>
                        {editingOffset === mel.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={offsetInput}
                            onChange={(e) => setOffsetInput(e.target.value)}
                            onBlur={() => handleOffsetSave(mel.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleOffsetSave(mel.id); if (e.key === 'Escape') setEditingOffset(null); }}
                            className="form-input text-xs w-20 py-0.5 px-2 rounded-md"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setEditingOffset(mel.id); setOffsetInput(String(mel.offsetMs)); }}
                            className="text-xs text-accent tabular-nums hover:bg-hover px-1.5 py-0.5 rounded transition-colors"
                          >
                            {formatOffset(mel.offsetMs)}
                          </button>
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(mel.id)}
                        className="shrink-0 p-1 rounded-full text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                        aria-label="Delete melody"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upload modal */}
        <AnimatePresence>
          {uploadOpen && (
            <motion.div
              className="fixed inset-0 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => !uploading && setUploadOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="modal w-full max-w-[400px] p-6 space-y-5"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.25, ease: EASE_OUT_EXPO, delay: 0.04 }}
              >
                <h2 className="text-base font-bold text-text m-0">Add melody</h2>
                <p className="text-sm text-secondary m-0">
                  Upload a vocal melody, harmony, or instrument layer to overlay with this sketch.
                </p>
                <div
                  className="border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/[0.03] transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 size={24} className="animate-spin text-accent mx-auto" />
                  ) : (
                    <>
                      <Upload size={24} className="text-tertiary mx-auto mb-2" />
                      <p className="m-0 text-sm text-secondary">Click to choose an audio file</p>
                      <p className="m-0 mt-1 text-xs text-tertiary">MP3, WAV, FLAC, OGG, M4A</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleUpload}
                  className="hidden"
                />
                <div className="flex justify-end">
                  <button type="button" onClick={() => setUploadOpen(false)} disabled={uploading} className="btn">
                    Cancel
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FadeUp>
  );
}

function MelodyLabel({ mel, onSave }: { mel: ApiMelody; onSave: (id: string, label: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mel.label);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { onSave(mel.id, value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(mel.id, value); setEditing(false); } if (e.key === 'Escape') { setValue(mel.label); setEditing(false); } }}
        className="form-input text-sm flex-1 py-0.5 px-2 rounded-md"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex-1 text-left text-sm font-medium text-text hover:text-accent transition-colors truncate flex items-center gap-1.5 min-w-0"
    >
      <span className="truncate">{mel.label}</span>
      <Pencil size={12} className="text-tertiary shrink-0 opacity-0 group-hover:opacity-100" />
    </button>
  );
}
