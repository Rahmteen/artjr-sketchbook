import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Volume2,
  VolumeX,
  Headphones,
  Trash2,
  Loader2,
  Upload,
} from 'lucide-react';
import { melodiesApi } from '../api/client';
import type { ApiMelody } from '../api/client';
import type { AudioEngine } from '../lib/audioEngine';
import { getPeaks, timelinePeaksFromCanonicalPeaks } from '../lib/audioPeaks';
import { getTierColor } from './ui/ColorPicker';
import { FadeUp } from './ui/Motion';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from './ui/Motion';

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
  onRequestEngine?: () => void;
  engineLoading?: boolean;
  engineRef?: React.MutableRefObject<AudioEngine | null>;
  transport?: MelodiesTransport;
}

const PROGRESS_COLOR = 'rgba(124, 58, 237, 0.8)';
const BAR_COLOR_GRAY = 'rgba(113, 113, 122, 0.65)';
const MINI_STRIP_HEIGHT = 28;
const MINI_STRIP_BARS = 140;

function MelodyMiniWaveform({
  peaks,
  currentTime,
  sketchDuration,
  melodyModeActive,
  onSeek,
  inactive = false,
}: {
  peaks: number[];
  currentTime: number;
  sketchDuration: number;
  melodyModeActive: boolean;
  onSeek?: (timeSeconds: number) => void;
  inactive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDrawRef = useRef({ time: 0, currentTime: -1 });
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    const id = requestAnimationFrame(() => { update(); });
    return () => { ro.disconnect(); cancelAnimationFrame(id); };
  }, []);

  useEffect(() => {
    if (peaks.length > 0 && width <= 0 && containerRef.current) {
      const id = requestAnimationFrame(() => setWidth(containerRef.current?.offsetWidth ?? 0));
      return () => cancelAnimationFrame(id);
    }
  }, [peaks.length, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks.length || sketchDuration <= 0 || width <= 0) return;
    const now = Date.now();
    const prev = lastDrawRef.current;
    const timeDeltaOk = now - prev.time >= 100;
    const progressDelta = sketchDuration > 0 ? Math.abs(currentTime - prev.currentTime) / sketchDuration : 1;
    if (prev.currentTime >= 0 && !timeDeltaOk && progressDelta < 0.005) return;
    lastDrawRef.current = { time: now, currentTime };
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = width;
    const h = MINI_STRIP_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const gap = 1;
    const barW = Math.max(1, w / peaks.length - gap);
    const halfH = h / 2;
    const barScale = 0.85;
    const progress = inactive ? 0 : Math.max(0, Math.min(1, sketchDuration > 0 ? currentTime / sketchDuration : 0));
    for (let i = 0; i < peaks.length; i++) {
      const x = i * (barW + gap);
      const peak = peaks[i] ?? 0;
      const barH = Math.max(1, peak * halfH * barScale);
      if (inactive) {
        ctx.fillStyle = BAR_COLOR_GRAY;
      } else {
        const isElapsed = (i + 1) / peaks.length <= progress || (i / peaks.length < progress && progress > 0);
        ctx.fillStyle = isElapsed ? PROGRESS_COLOR : BAR_COLOR_GRAY;
      }
      ctx.fillRect(x, halfH - barH, barW, barH * 2);
    }
    if (!inactive && melodyModeActive && sketchDuration > 0) {
      ctx.fillStyle = PROGRESS_COLOR;
      ctx.fillRect(progress * w - 1, 0, 2, h);
    }
  }, [peaks, currentTime, sketchDuration, melodyModeActive, width, inactive]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || sketchDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(fraction * sketchDuration);
  }, [onSeek, sketchDuration]);

  return (
    <div ref={containerRef} className="flex-1 min-w-[120px] h-7 flex items-center overflow-hidden" style={{ minHeight: MINI_STRIP_HEIGHT }}>
      <canvas
        ref={canvasRef}
        height={MINI_STRIP_HEIGHT}
        className={`block w-full shrink-0 ${inactive ? '' : 'cursor-pointer'}`}
        style={{ height: MINI_STRIP_HEIGHT, width: '100%' }}
        onClick={inactive ? undefined : handleCanvasClick}
        aria-hidden
      />
    </div>
  );
}

export function MelodiesSection({
  sketchId,
  sketchDuration,
  melodies,
  onMelodiesChange,
  melodyModeActive,
  onMelodyModeChange,
  onRequestEngine,
  engineLoading = false,
  engineRef: externalEngineRef,
  transport,
}: MelodiesSectionProps) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [soloId, setSoloId] = useState<string | null>(null);
  const [selectedMelodyId, setSelectedMelodyId] = useState<string | null>(null);
  const [editingOffset, setEditingOffset] = useState<string | null>(null);
  const [offsetInput, setOffsetInput] = useState('');
  const [mainVolume, setMainVolume] = useState(1);
  const [melodyPeaks, setMelodyPeaks] = useState<Record<string, number[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMelodies = useCallback(() => {
    melodiesApi.list(sketchId).then((list) => { onMelodiesChange(list); setLoading(false); }).catch(() => setLoading(false));
  }, [sketchId, onMelodiesChange]);

  useEffect(() => { loadMelodies(); }, [loadMelodies]);

  const melodyPeaksKey = useMemo(
    () => melodies.map((m) => `${m.id}-${sketchDuration}-${m.offsetMs}-${m.durationSeconds}`).join('|'),
    [sketchDuration, melodies]
  );

  useEffect(() => {
    if (melodies.length === 0) return;
    if (!transport || sketchDuration <= 0) return;
    let cancelled = false;
    const load = async () => {
      const next: Record<string, number[]> = {};
      for (const mel of melodies) {
        if (cancelled) return;
        const srcDuration = mel.durationSeconds ?? 60;
        let canonical: number[];
        try {
          canonical = await melodiesApi.getPeaks(mel.id);
        } catch {
          try {
            canonical = await getPeaks(melodiesApi.audioUrl(mel.id), {
              durationSeconds: srcDuration,
              offsetMs: 0,
              sourceDurationSeconds: srcDuration,
              numBars: 256,
            });
          } catch (err) {
            if (!cancelled) {
              console.warn('[MelodiesSection] getPeaks failed for', mel.id, err);
              next[mel.id] = [];
            }
            continue;
          }
        }
        if (!cancelled && canonical.length) {
          next[mel.id] = timelinePeaksFromCanonicalPeaks(
            canonical,
            srcDuration,
            sketchDuration,
            mel.offsetMs,
            MINI_STRIP_BARS
          );
        }
      }
      if (!cancelled) setMelodyPeaks((prev) => ({ ...prev, ...next }));
    };
    load();
    return () => { cancelled = true; };
  }, [melodyPeaksKey, sketchDuration, melodies, transport]);

  const defaultSelectedId = useMemo(() => {
    const sorted = [...melodies].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted[0]?.id ?? null;
  }, [melodies]);

  const activeMelodyId = selectedMelodyId ?? defaultSelectedId;

  const handleMelodyModeToggle = () => {
    const next = !melodyModeActive;
    onMelodyModeChange(next);
    const engine = externalEngineRef?.current;
    if (!engine) return;
    engine.seek(0);
    if (next) {
      const nextMuted: Record<string, boolean> = {};
      melodies.forEach((mel) => {
        const m = mel.id !== activeMelodyId;
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

  const handleSelectMelody = useCallback(
    (melId: string, e: React.MouseEvent) => {
      if (!melodyModeActive || !externalEngineRef?.current) return;
      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
      setSelectedMelodyId(melId);
      melodies.forEach((mel) => {
        externalEngineRef.current!.muteTrack(mel.id, mel.id !== melId);
      });
      setMuted((prev) => {
        const next = { ...prev };
        melodies.forEach((mel) => { next[mel.id] = mel.id !== melId; });
        return next;
      });
    },
    [melodyModeActive, melodies, externalEngineRef]
  );

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

  const isEngineActive = !!transport && melodyModeActive;

  if (loading) return null;

  return (
    <FadeUp delay={0.1}>
      <div className="space-y-4">
        {/* Header row: title, count badge, switch, main volume, add */}
        <div className="flex items-center gap-3">
          <h3 className="m-0 text-[11px] font-medium uppercase tracking-wider text-tertiary">Melodies</h3>
          {melodies.length > 0 && !isEngineActive && (
            <span className="text-[10px] font-medium text-tertiary tabular-nums rounded-full bg-surface px-2 py-0.5">
              {melodies.length}
            </span>
          )}
          {melodies.length > 0 && (
            <button
              type="button"
              onClick={transport ? handleMelodyModeToggle : () => onRequestEngine?.()}
              disabled={!transport && (!onRequestEngine || engineLoading)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none ${
                engineLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer'
              } ${isEngineActive ? 'bg-accent' : 'bg-border'}`}
              role="switch"
              aria-checked={isEngineActive}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  isEngineActive ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          )}
          {isEngineActive && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-tertiary">Main</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={mainVolume}
                onChange={(e) => transport && handleMainVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-0.5 accent-accent"
              />
            </div>
          )}
          <div className="flex-1" />
          <button type="button" onClick={() => setUploadOpen(true)} className="text-[11px] text-tertiary hover:text-text transition-colors">
            <Plus size={12} className="inline" /> Add
          </button>
        </div>

        {melodies.length === 0 ? (
          <p className="m-0 py-6 text-center text-[11px] text-tertiary">No melodies yet.</p>
        ) : !isEngineActive ? null : (
          <div className="space-y-1.5">
            <AnimatePresence>
              {melodies.map((mel, idx) => {
                const color = getTierColor(mel.color);
                const isMuted = muted[mel.id] ?? false;
                const isSolo = soloId === mel.id;
                const vol = volumes[mel.id] ?? 1;
                const isActiveMelody = melodyModeActive && !!transport && activeMelodyId === mel.id;

                return (
                  <motion.div
                    key={mel.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: isActiveMelody ? 1 : 0.5, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3, delay: idx * 0.06, ease: EASE_OUT_EXPO }}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleSelectMelody(mel.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectMelody(mel.id, e as unknown as React.MouseEvent);
                      }
                    }}
                    className="py-1.5 px-2 flex items-center gap-2 min-h-[32px] rounded transition-opacity cursor-pointer"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: color?.hex ?? '#71717A' }}
                    />
                    <MelodyLabel mel={mel} onSave={handleLabelEdit} editable={isActiveMelody} />
                    <div className="flex-1 min-w-0 self-stretch flex items-center">
                      <MelodyMiniWaveform
                        peaks={melodyPeaks[mel.id] ?? []}
                        currentTime={transport?.currentTime ?? 0}
                        sketchDuration={sketchDuration > 0 ? sketchDuration : (mel.durationSeconds ?? 1)}
                        melodyModeActive={melodyModeActive}
                        onSeek={isActiveMelody ? (t) => externalEngineRef?.current?.seek(t) : undefined}
                        inactive={!isActiveMelody}
                      />
                    </div>
                    <div className={`flex items-center gap-2 shrink-0 ${isActiveMelody ? '' : 'invisible pointer-events-none'}`}>
                      <button
                        type="button"
                        onClick={() => handleMuteToggle(mel.id)}
                        className={`shrink-0 p-0.5 rounded transition-colors ${isMuted ? 'text-danger' : 'text-tertiary hover:text-text'}`}
                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                        tabIndex={isActiveMelody ? 0 : -1}
                      >
                        {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={vol}
                        onChange={(e) => handleVolumeChange(mel.id, parseFloat(e.target.value))}
                        className="w-12 h-0.5 accent-accent shrink-0"
                        tabIndex={isActiveMelody ? 0 : -1}
                      />
                      <button
                        type="button"
                        onClick={() => handleSoloToggle(mel.id)}
                        className={`shrink-0 p-0.5 rounded text-[10px] ${isSolo ? 'text-accent' : 'text-tertiary hover:text-text'}`}
                        title="Solo"
                        tabIndex={isActiveMelody ? 0 : -1}
                      >
                        <Headphones size={11} />
                      </button>
                      {editingOffset === mel.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={offsetInput}
                          onChange={(e) => setOffsetInput(e.target.value)}
                          onBlur={() => handleOffsetSave(mel.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleOffsetSave(mel.id); if (e.key === 'Escape') setEditingOffset(null); }}
                          className="form-input text-[10px] w-14 py-0.5 px-1 rounded border-border shrink-0"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingOffset(mel.id); setOffsetInput(String(mel.offsetMs)); }}
                          className="text-[10px] text-tertiary tabular-nums hover:text-accent px-1 py-0.5 rounded shrink-0"
                          tabIndex={isActiveMelody ? 0 : -1}
                        >
                          {formatOffset(mel.offsetMs)}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(mel.id)}
                      className="shrink-0 p-0.5 rounded text-tertiary hover:text-danger"
                      aria-label="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
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

function MelodyLabel({ mel, onSave, editable }: { mel: ApiMelody; onSave: (id: string, label: string) => void; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mel.label);

  if (editing && editable) {
    return (
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { onSave(mel.id, value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(mel.id, value); setEditing(false); } if (e.key === 'Escape') { setValue(mel.label); setEditing(false); } }}
        className="form-input text-xs flex-1 py-0.5 px-1.5 rounded border-border min-w-0"
      />
    );
  }

  return (
    <span
      onDoubleClick={editable ? () => { setValue(mel.label); setEditing(true); } : undefined}
      className={`flex-1 text-left text-xs font-medium text-text truncate min-w-0 ${editable ? 'cursor-text' : ''}`}
    >
      {mel.label}
    </span>
  );
}
