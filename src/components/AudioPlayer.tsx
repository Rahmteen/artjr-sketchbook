import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useWavesurfer } from '@wavesurfer/react';
import { Play, Pause, Repeat, Repeat1, PenLine } from 'lucide-react';
import type { ApiSketch, ApiMelody } from '../api/client';
import { sketchesApi, notesApi, melodiesApi } from '../api/client';
import type { LoopMode } from '../lib/audioEngine';
import { getPeaks } from '../lib/audioPeaks';

export type { LoopMode };

export interface Transport {
  play: () => void | Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  loopMode: LoopMode;
  setLoopMode: (mode: LoopMode) => void;
}

export interface MelodyOverlayData {
  melodies: ApiMelody[];
  sketchDuration: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
  /** When false, the melody waveform overlay is hidden (e.g. when "Melodies off" is toggled). Default true. */
  visible?: boolean;
}

interface AudioPlayerProps {
  sketch: ApiSketch;
  onTimeUpdate?: (timeSeconds: number) => void;
  onNoteAdded?: () => void;
  transport?: Transport;
  melodyOverlay?: MelodyOverlayData;
}

export interface AudioPlayerHandle {
  seek: (seconds: number) => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const LOOP_LABELS: Record<LoopMode, string> = {
  off: 'No repeat',
  once: 'Repeat once',
  infinite: 'Repeat all',
};

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  { sketch, onTimeUpdate, onNoteAdded, transport, melodyOverlay },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const audioUrl = sketchesApi.audioUrl(sketch.id);
  const [loopMode, setLoopMode] = useState<LoopMode>('off');
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addNoteContent, setAddNoteContent] = useState('');
  const [addNoteLoading, setAddNoteLoading] = useState(false);
  const onceRepeatedRef = useRef(false);
  const [melodyPeaks, setMelodyPeaks] = useState<Record<string, number[]>>({});

  const useTransport = !!transport;
  const displayTime = useTransport ? transport.currentTime : 0;
  const displayPlaying = useTransport ? transport.isPlaying : false;
  const displayDuration = useTransport ? transport.duration : sketch.durationSeconds ?? 0;

  const { wavesurfer, isReady, isPlaying, currentTime } = useWavesurfer({
    container: containerRef,
    url: audioUrl,
    height: 56,
    waveColor: '#71717A',
    progressColor: '#7C3AED',
    cursorColor: '#7C3AED',
    cursorWidth: 2,
    barWidth: 2,
    barGap: 1,
    barRadius: 1,
    normalize: true,
  });

  useImperativeHandle(ref, () => ({
    seek(seconds: number) {
      if (useTransport) {
        transport?.seek(seconds);
        return;
      }
      if (!wavesurfer || !isReady) return;
      const duration = wavesurfer.getDuration();
      if (duration > 0) wavesurfer.seekTo(Math.max(0, Math.min(1, seconds / duration)));
    },
  }), [wavesurfer, isReady, useTransport, transport]);

  useEffect(() => {
    if (useTransport) onTimeUpdate?.(transport?.currentTime ?? 0);
    else onTimeUpdate?.(currentTime);
  }, [useTransport, useTransport ? transport?.currentTime : currentTime, onTimeUpdate]);

  useEffect(() => {
    if (!wavesurfer || !isReady) return;
    const media = wavesurfer.getMediaElement();
    if (!media) return;
    if (useTransport) {
      media.volume = 0;
      return;
    }
    media.volume = 1;
    media.loop = loopMode === 'infinite';
    const onFinish = () => {
      if (loopMode === 'once' && !onceRepeatedRef.current) {
        onceRepeatedRef.current = true;
        wavesurfer.play();
      }
    };
    wavesurfer.on('finish', onFinish);
    return () => { wavesurfer.un('finish', onFinish); };
  }, [wavesurfer, isReady, loopMode, useTransport]);

  useEffect(() => {
    if (!useTransport || loopMode !== 'once') return;
    onceRepeatedRef.current = false;
  }, [useTransport, transport?.loopMode, displayPlaying]);

  useEffect(() => {
    if (!useTransport || !wavesurfer || !isReady) return;
    const dur = wavesurfer.getDuration();
    if (dur <= 0) return;
    const t = transport?.currentTime ?? 0;
    wavesurfer.seekTo(Math.max(0, Math.min(1, t / dur)));
  }, [useTransport, transport?.currentTime, wavesurfer, isReady]);

  useEffect(() => {
    if (!useTransport || !wavesurfer) return;
    const onInteraction = (newTime: number) => {
      transport?.seek(newTime);
    };
    wavesurfer.on('interaction', onInteraction);
    return () => { wavesurfer.un('interaction', onInteraction); };
  }, [useTransport, transport, wavesurfer]);

  const cycleLoop = () => {
    if (useTransport) {
      const next: LoopMode = transport?.loopMode === 'off' ? 'once' : transport?.loopMode === 'once' ? 'infinite' : 'off';
      transport?.setLoopMode(next);
      return;
    }
    setLoopMode((prev) => (prev === 'off' ? 'once' : prev === 'once' ? 'infinite' : 'off'));
  };

  const effectiveLoopMode = useTransport ? (transport?.loopMode ?? 'off') : loopMode;
  const duration = useTransport ? displayDuration : (wavesurfer && isReady ? wavesurfer.getDuration() : sketch.durationSeconds ?? 0);
  const showAddNote = ((useTransport ? displayTime : currentTime) > 0 || (useTransport ? displayPlaying : isPlaying)) && isReady;

  const handleAddNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const content = addNoteContent.trim();
    if (!content) return;
    setAddNoteLoading(true);
    const timeSec = useTransport ? (transport?.currentTime ?? 0) : currentTime;
    notesApi
      .create(sketch.id, { type: 'timestamp', content, timeSeconds: timeSec })
      .then(() => { setAddNoteContent(''); setAddNoteOpen(false); onNoteAdded?.(); })
      .finally(() => setAddNoteLoading(false));
  };

  const melodyOverlayKey = melodyOverlay ? `${melodyOverlay.melodies.map((m) => m.id).join(',')}-${melodyOverlay.sketchDuration}` : '';
  useEffect(() => {
    if (!melodyOverlay?.melodies.length || !melodyOverlay.sketchDuration) return;
    let cancelled = false;
    const load = async () => {
      const next: Record<string, number[]> = {};
      for (const mel of melodyOverlay.melodies) {
        if (cancelled) return;
        try {
          const peaks = await getPeaks(melodiesApi.audioUrl(mel.id), {
            durationSeconds: melodyOverlay.sketchDuration,
            offsetMs: mel.offsetMs,
            sourceDurationSeconds: mel.durationSeconds,
            numBars: 256,
          });
          if (!cancelled) next[mel.id] = peaks;
        } catch {
          if (!cancelled) next[mel.id] = [];
        }
      }
      if (!cancelled) setMelodyPeaks((prev) => ({ ...prev, ...next }));
    };
    load();
    return () => { cancelled = true; };
  }, [melodyOverlayKey]);

  useEffect(() => {
    if (!melodyOverlay || melodyOverlay.visible === false || !overlayRef.current || !Object.keys(melodyPeaks).length) return;
    const canvas = overlayRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const dur = melodyOverlay.sketchDuration || 1;
    const t = melodyOverlay.currentTime;
    const progress = t / dur;
    // Same hue as progress (accent) but softer: accent-muted at ~50% so melody reads as a clear secondary layer
    const melodyFill = 'rgba(167, 139, 250, 0.52)';
    const melodyBarScale = 0.85; // Slightly shorter bars so they sit as a trace on top
    melodyOverlay.melodies.forEach((mel) => {
      const peaks = melodyPeaks[mel.id];
      if (!peaks?.length) return;
      const barW = w / peaks.length;
      const halfH = h / 2;
      for (let i = 0; i < peaks.length; i++) {
        const x = (i / peaks.length) * w;
        const peak = peaks[i] ?? 0;
        const barH = Math.max(1, peak * halfH * melodyBarScale);
        ctx.fillStyle = melodyFill;
        ctx.fillRect(x, halfH - barH, Math.max(1, barW), barH * 2);
      }
    });
    ctx.fillStyle = 'rgba(124, 58, 237, 0.5)';
    ctx.fillRect(progress * w - 1, 0, 2, h);
  }, [melodyOverlay, melodyPeaks, melodyOverlay?.currentTime]);

  return (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={() => (useTransport ? (displayPlaying ? transport?.pause() : transport?.play()) : wavesurfer?.playPause())}
        disabled={!isReady}
        aria-label={displayPlaying || isPlaying ? 'Pause' : 'Play'}
        className="flex items-center justify-center w-11 h-11 rounded-full bg-elevated text-text hover:bg-hover hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {(displayPlaying || isPlaying) ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
      </button>
      <div className="min-h-[56px] flex-1 min-w-0 rounded-md overflow-hidden relative">
        <div ref={containerRef} className="min-h-[56px] w-full relative z-0" />
        {melodyOverlay && melodyOverlay.visible !== false && Object.keys(melodyPeaks).length > 0 && (
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-auto cursor-pointer z-10"
            style={{ height: 56 }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const sec = Math.max(0, Math.min(melodyOverlay.sketchDuration, x * melodyOverlay.sketchDuration));
              melodyOverlay.onSeek(sec);
            }}
          />
        )}
      </div>
      <div className={`flex items-center shrink-0 transition-opacity duration-200 ${showAddNote ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="relative">
          <button
            ref={addNoteButtonRef}
            type="button"
            onClick={() => setAddNoteOpen((open) => !open)}
            aria-label="Add note at current time"
            aria-expanded={addNoteOpen}
            className="flex items-center justify-center w-9 h-9 rounded-full text-secondary hover:text-text hover:bg-hover transition-colors"
          >
            <PenLine size={16} />
          </button>
          {addNoteOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[220px] p-3 rounded-md bg-elevated border border-border shadow-modal" role="dialog" aria-label="Add note">
              <form onSubmit={handleAddNoteSubmit} className="space-y-2">
                <input
                  type="text"
                  value={addNoteContent}
                  onChange={(e) => setAddNoteContent(e.target.value)}
                  placeholder="Note text..."
                  className="form-input text-sm w-full"
                  autoFocus
                  disabled={addNoteLoading}
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" className="btn text-sm" onClick={() => { setAddNoteOpen(false); setAddNoteContent(''); }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary text-sm" disabled={addNoteLoading || !addNoteContent.trim()}>
                    {addNoteLoading ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={cycleLoop}
        aria-label={LOOP_LABELS[effectiveLoopMode]}
        className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors ${
          effectiveLoopMode === 'off' ? 'text-secondary hover:text-text hover:bg-hover' : 'text-accent hover:bg-hover'
        }`}
      >
        {effectiveLoopMode === 'once' ? <Repeat1 size={18} /> : <Repeat size={18} />}
      </button>
      <span className="text-sm text-tertiary tabular-nums shrink-0 w-20 text-right">
        {formatTime(useTransport ? displayTime : currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
});
