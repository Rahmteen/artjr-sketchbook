import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Settings, Download } from 'lucide-react';
import { sketchesApi, notesApi, tagsApi, melodiesApi } from '../api/client';
import type { ApiSketch, ApiMelody } from '../api/client';
import type { Sketch } from '../types/sketch';
import { useSketchStore } from '../stores/sketchStore';
import { AudioPlayer, type AudioPlayerHandle } from '../components/AudioPlayer';
import { SketchSettingsModal } from '../components/SketchSettingsModal';
import { MelodiesSection } from '../components/MelodiesSection';
import { AudioEngine, type Track, type LoopMode } from '../lib/audioEngine';
import { TagPill } from '../components/ui/TagPill';
import { SkeletonLine } from '../components/ui/Skeleton';
import { FadeUp, Stagger, StaggerItem } from '../components/ui/Motion';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

function formatDuration(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDurationHuman(seconds?: number): string {
  if (seconds == null || Number.isNaN(seconds)) return '--';
  const s = Math.floor(seconds);
  if (s === 0) return '0 seconds';
  const minutes = Math.floor(s / 60);
  const secs = s % 60;
  if (minutes === 0) return secs === 1 ? '1 second' : `${secs} seconds`;
  const mStr = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  if (secs === 0) return mStr;
  const secStr = secs === 1 ? '1 second' : `${secs} seconds`;
  return `${mStr}, ${secStr}`;
}

export function SketchDetail() {
  const { id } = useParams<{ id: string }>();
  const { sketches, setSketches, updateSketch } = useSketchStore();
  const [sketch, setSketch] = useState<ApiSketch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'references'>('notes');
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [melodies, setMelodies] = useState<ApiMelody[]>([]);
  const engineRef = useRef<AudioEngine | null>(null);
  const [transportCurrentTime, setTransportCurrentTime] = useState(0);
  const [transportPlaying, setTransportPlaying] = useState(false);
  const [transportDuration, setTransportDuration] = useState(0);
  const [transportLoopMode, setTransportLoopMode] = useState<LoopMode>('off');
  const [transportReady, setTransportReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [melodyModeActive, setMelodyModeActive] = useState(true);
  const engineLoadCancelledRef = useRef(false);
  const [sketchPeaks, setSketchPeaks] = useState<number[] | null>(null);

  const melodyIdsKey = useMemo(() => melodies.map((m) => m.id).join(','), [melodies]);

  const loadSketch = useCallback(() => {
    if (!id) return;
    setError(null);
    sketchesApi
      .get(id)
      .then((s) => { setSketch(s); updateSketch(id, s as ApiSketch); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, updateSketch]);

  useEffect(() => { loadSketch(); }, [loadSketch]);
  const prevMelodyCountRef = useRef(0);
  useEffect(() => {
    if (prevMelodyCountRef.current === 0 && melodies.length > 0) setMelodyModeActive(true);
    prevMelodyCountRef.current = melodies.length;
  }, [melodies.length]);
  useEffect(() => {
    if (sketches.length === 0) {
      sketchesApi.list().then((list) => setSketches(list as Sketch[])).catch(() => {});
    }
  }, [sketches.length, setSketches]);
  useEffect(() => { tagsApi.list().then(setAllTags).catch(() => {}); }, []);
  useEffect(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) { setTagSuggestions([]); return; }
    setTagSuggestions(allTags.filter((t) => t.name.toLowerCase().includes(q)));
  }, [tagInput, allTags]);

  useEffect(() => {
    if (!sketch || melodies.length === 0) return;
    engineLoadCancelledRef.current = true;
    setEngineLoading(false);
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    setTransportReady(false);
    return () => {
      engineLoadCancelledRef.current = true;
    };
  }, [sketch?.id, melodyIdsKey]);


  const [peaksStatus, setPeaksStatus] = useState<'idle' | 'pending' | 'computing' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    if (!sketch?.id) return;
    setSketchPeaks(null);
    const statusFromSketch = sketch.peaksStatus;
    if (statusFromSketch === 'pending' || statusFromSketch === 'computing') setPeaksStatus(statusFromSketch);
    else setPeaksStatus('idle');

    let cancelled = false;
    const pollIntervalMs = 2000;
    const maxAttempts = 30;

    const tryLoad = (attempt: number) => {
      if (cancelled) return;
      sketchesApi
        .getPeaks(sketch.id)
        .then((peaks) => {
          if (!cancelled) {
            setSketchPeaks(peaks);
            setPeaksStatus('ready');
          }
        })
        .catch((err: Error & { status?: string }) => {
          if (cancelled) return;
          const isPending = err?.message === 'Peaks not ready' && (err?.status === 'pending' || err?.status === 'computing');
          if (isPending && attempt < maxAttempts) {
            if (!cancelled) setPeaksStatus(err.status === 'computing' ? 'computing' : 'pending');
            setTimeout(() => tryLoad(attempt + 1), pollIntervalMs);
          } else {
            if (!cancelled) setSketchPeaks(null);
            setPeaksStatus(isPending ? 'failed' : 'failed');
          }
        });
    };

    tryLoad(0);
    return () => { cancelled = true; };
  }, [sketch?.id, sketch?.peaksStatus]);


  const startEngineLoad = useCallback(() => {
    if (!sketch || melodies.length === 0 || engineRef.current) return;
    engineLoadCancelledRef.current = false;
    setEngineLoading(true);
    const engine = new AudioEngine(
      () => { if (!engineLoadCancelledRef.current) setTransportPlaying(engine.isPlaying); },
      (t) => { if (!engineLoadCancelledRef.current) setTransportCurrentTime(t); }
    );
    engineRef.current = engine;
    const sketchTrack: Track = {
      id: 'sketch',
      url: sketchesApi.audioUrl(sketch.id),
      offsetMs: 0,
      volume: 1,
      muted: false,
    };
    const sorted = [...melodies].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const defaultSelectedId = sorted[0]?.id ?? null;
    engine
      .loadTrack(sketchTrack)
      .then(() =>
        Promise.allSettled(
          melodies.map((mel) =>
            engine.loadTrack({
              id: mel.id,
              url: melodiesApi.audioUrl(mel.id),
              offsetMs: mel.offsetMs,
              volume: 1,
              muted: mel.id !== defaultSelectedId,
            })
          )
        )
      )
      .then((results) => {
        if (!engineLoadCancelledRef.current) {
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn('[SketchDetail] Some melody tracks failed to load:', failed.length, failed.map((r) => (r as PromiseRejectedResult).reason));
          }
          setTransportDuration(engine.duration);
          engine.seek(0);
          setTransportReady(true);
        } else {
          engine.destroy();
        }
        setEngineLoading(false);
      })
      .catch((err) => {
        if (!engineLoadCancelledRef.current) {
          console.error('[SketchDetail] AudioEngine load failed:', err);
        }
        engineRef.current = null;
        engine.destroy();
        setEngineLoading(false);
      });
  }, [sketch, melodies]);

  const currentTimeRef = useRef(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const lastPlaybackFlushRef = useRef(0);
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);
  const handleTimeUpdate = useCallback((t: number) => {
    currentTimeRef.current = t;
    const now = Date.now();
    if (now - lastPlaybackFlushRef.current >= 250) {
      lastPlaybackFlushRef.current = now;
      setPlaybackTime(t);
    }
  }, []);
  const handleNoteDeleted = () => { if (id) loadSketch(); };
  const handleSketchUpdated = useCallback((s: ApiSketch) => { setSketch(s); updateSketch(s.id, s); }, [updateSketch]);
  const handleNoteAdded = () => { if (id) loadSketch(); };

  const addTag = async (tagIdOrName: string) => {
    if (!id || !sketch) return;
    setTagsLoading(true);
    try {
      let tagId = allTags.find((t) => t.id === tagIdOrName || t.name.toLowerCase() === tagIdOrName.toLowerCase())?.id;
      if (!tagId) {
        const created = await tagsApi.create(tagIdOrName);
        tagId = created.id;
        setAllTags((prev) => [...prev, created]);
      }
      const currentIds = sketch.tagIds ?? sketch.tags?.map((t) => t.id) ?? [];
      if (currentIds.includes(tagId)) return;
      const updated = await sketchesApi.setTags(id, [...currentIds, tagId]);
      setSketch(updated);
      updateSketch(id, updated);
      setTagInput('');
      setTagSuggestions([]);
    } finally {
      setTagsLoading(false);
    }
  };

  const removeTag = async (tagId: string) => {
    if (!id || !sketch) return;
    const currentIds = (sketch.tagIds ?? sketch.tags?.map((t) => t.id) ?? []).filter((sid) => sid !== tagId);
    const updated = await sketchesApi.setTags(id, currentIds);
    setSketch(updated);
    updateSketch(id, updated);
  };

  const currentTime = transportReady ? transportCurrentTime : playbackTime;
  const activeNoteId = useMemo(() => {
    if (!sketch) return null;
    for (const n of sketch.notes) {
      if (n.type === 'timestamp' && n.timeSeconds != null) {
        const delta = currentTime - n.timeSeconds;
        if (delta >= -1 && delta < 0) return n.id;
      }
    }
    return null;
  }, [sketch, currentTime]);

  const showSkeleton = useDelayedLoading(loading);

  if ((loading && !showSkeleton) || !id) return null;

  if (showSkeleton) {
    return (
      <div className="space-y-8">
        <SkeletonLine width="120px" height="14px" />
        <div className="space-y-3">
          <SkeletonLine width="60%" height="32px" />
          <SkeletonLine width="40%" height="16px" />
        </div>
        <SkeletonLine width="100%" height="56px" />
      </div>
    );
  }

  if (error && !sketch) {
    return (
      <div className="space-y-4">
        <p className="text-danger">{error}</p>
        <Link to="/sketches" className="btn">Back to sketches</Link>
      </div>
    );
  }

  if (!sketch) {
    return (
      <div className="space-y-4">
        <p className="text-text">Sketch not found</p>
        <Link to="/sketches" className="btn">Back to sketches</Link>
      </div>
    );
  }

  const metaTags = [
    formatDurationHuman(sketch.durationSeconds),
    sketch.bpm != null ? `${sketch.bpm} BPM` : null,
    sketch.key ?? null,
    `v${sketch.version}${sketch.versionLabel ? ` · ${sketch.versionLabel}` : ''}`,
  ].filter(Boolean);

  return (
    <Stagger className="space-y-12">
      {/* Back link */}
      <StaggerItem>
        <div>
          <Link to="/sketches" className="inline-flex items-center gap-1 text-sm text-secondary hover:text-text no-underline transition-colors">
            <ChevronLeft size={16} /> Back to sketches
          </Link>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </StaggerItem>

      {/* Header */}
      <StaggerItem>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-3xl font-bold text-text tracking-tight">{sketch.title}</h1>
            {sketch.description && <p className="mt-3 text-base text-secondary max-w-2xl">{sketch.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary">
              {metaTags.map((tag, i) => (
                <span key={i}>{tag}</span>
              ))}
            </div>
            {/* Tags */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(sketch.tags ?? []).map((t) => (
                <TagPill key={t.id} name={t.name} onRemove={() => removeTag(t.id)} />
              ))}
              <div className="relative inline-block">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = tagInput.trim(); if (v) addTag(v); } }}
                  placeholder="Add tag..."
                  className="form-input text-xs w-28 py-0.5 px-2.5 rounded-full h-[22px]"
                />
                {tagSuggestions.length > 0 && (
                  <ul className="absolute top-full left-0 mt-1 py-1 rounded-md bg-elevated border border-border shadow-modal z-10 min-w-[140px] list-none m-0 p-0">
                    {tagSuggestions.slice(0, 5).map((t) => (
                      <li key={t.id}>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm text-text hover:bg-hover rounded-md transition-colors" onClick={() => addTag(t.id)}>
                          {t.name}
                        </button>
                      </li>
                    ))}
                    {tagInput.trim() && !tagSuggestions.some((s) => s.name.toLowerCase() === tagInput.trim().toLowerCase()) && (
                      <li>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-hover rounded-md transition-colors" onClick={() => addTag(tagInput.trim())}>
                          Create &quot;{tagInput.trim()}&quot;
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
              {tagsLoading && <span className="text-xs text-tertiary">Saving...</span>}
            </div>
            {sketch.collections && sketch.collections.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-secondary">
                <span>Collections:</span>
                {sketch.collections.map((c) => (
                  <Link key={c.collectionId} to={`/collections/${c.collectionId}`} className="text-accent hover:underline">
                    {c.collectionName}{c.tierLabel ? ` · ${c.tierLabel}` : ''}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={sketchesApi.downloadUrl(sketch.id)}
              download={sketch.fileName}
              aria-label="Download"
              className="flex items-center justify-center w-10 h-10 rounded-full text-secondary hover:text-text hover:bg-hover transition-colors"
            >
              <Download size={18} />
            </a>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="flex items-center justify-center w-10 h-10 rounded-full text-secondary hover:text-text hover:bg-hover transition-colors"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
      </StaggerItem>

      {/* Audio player */}
      <StaggerItem>
        <div>
          {(peaksStatus === 'pending' || peaksStatus === 'computing') && (
            <p className="text-xs text-tertiary mb-1" role="status">
              Waveform: {peaksStatus === 'computing' ? 'generating…' : 'loading…'}
            </p>
          )}
          {peaksStatus === 'failed' && !sketchPeaks?.length && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Waveform unavailable</p>
          )}
          <AudioPlayer
            ref={audioPlayerRef}
            sketch={sketch}
            sketchPeaks={sketchPeaks ?? undefined}
            onTimeUpdate={handleTimeUpdate}
            onNoteAdded={handleNoteAdded}
            transport={
              melodies.length > 0 && transportReady
                ? {
                    play: () => engineRef.current?.play(),
                    pause: () => engineRef.current?.pause(),
                    seek: (t: number) => engineRef.current?.seek(t),
                    currentTime: transportCurrentTime,
                    isPlaying: transportPlaying,
                    duration: transportDuration,
                    loopMode: transportLoopMode,
                    setLoopMode: (m: LoopMode) => {
                      if (engineRef.current) engineRef.current.loopMode = m;
                      setTransportLoopMode(m);
                    },
                  }
                : undefined
            }
          />
        </div>
      </StaggerItem>

      {/* Melodies */}
      <StaggerItem>
        <MelodiesSection
          sketchId={sketch.id}
          sketchDuration={transportReady ? transportDuration : (sketch.durationSeconds ?? 0)}
          melodies={melodies}
          onMelodiesChange={setMelodies}
          melodyModeActive={melodyModeActive}
          onMelodyModeChange={setMelodyModeActive}
          onRequestEngine={startEngineLoad}
          engineLoading={engineLoading}
          engineRef={melodies.length > 0 ? engineRef : undefined}
          transport={
            melodies.length > 0 && transportReady
              ? {
                  currentTime: transportCurrentTime,
                  isPlaying: transportPlaying,
                  duration: transportDuration,
                  loopMode: transportLoopMode,
                  setLoopMode: (m: LoopMode) => {
                    if (engineRef.current) engineRef.current.loopMode = m;
                    setTransportLoopMode(m);
                  },
                  setMainVolume: (vol: number) => engineRef.current?.setTrackVolume('sketch', vol),
                }
              : undefined
          }
        />
      </StaggerItem>

      {/* Tabs */}
      <StaggerItem>
        <section className="space-y-6">
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'notes' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-text'
              }`}
            >
              Notes
            </button>
          </div>

          {activeTab === 'notes' && (
            <FadeUp duration={0.3}>
              <div className="space-y-6">
                {sketch.notes.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="m-0 text-sm text-secondary">No notes yet</p>
                  </div>
                ) : (
                  <ul className="list-none p-0 m-0 space-y-1">
                    {sketch.notes.map((n) => {
                      const isActive = n.id === activeNoteId;
                      return (
                        <li
                          key={n.id}
                          className={`flex flex-wrap items-center justify-between gap-2 py-3 px-3 -mx-1 rounded border-b border-border last:border-0 transition-colors duration-300 ${
                            isActive ? 'bg-accent/10 border-transparent' : ''
                          }`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            {n.type === 'timestamp' && n.timeSeconds != null && (
                              <button
                                type="button"
                                className={`text-xs tabular-nums transition-colors duration-300 ${isActive ? 'text-accent font-semibold' : 'text-accent hover:underline'}`}
                                onClick={() => { audioPlayerRef.current?.seek(n.timeSeconds!); }}
                              >
                                {formatDuration(n.timeSeconds)}
                              </button>
                            )}
                            <span className={`text-sm transition-colors duration-300 ${isActive ? 'text-accent' : 'text-text'}`}>{n.content}</span>
                          </span>
                          <button
                            type="button"
                            className="text-xs text-tertiary hover:text-danger transition-colors"
                            onClick={() => notesApi.delete(n.id).then(handleNoteDeleted)}
                          >
                            Delete
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </FadeUp>
          )}

        </section>
      </StaggerItem>

      {settingsOpen && (
        <SketchSettingsModal
          sketch={sketch}
          onClose={() => setSettingsOpen(false)}
          onSketchUpdated={handleSketchUpdated}
        />
      )}
    </Stagger>
  );
}
