import { useRef, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useWavesurfer } from '@wavesurfer/react';
import { Play, Pause, Repeat, Repeat1, PenLine, Loader2 } from 'lucide-react';
import type { ApiSketch } from '../api/client';
import { sketchesApi, notesApi } from '../api/client';
import type { LoopMode } from '../lib/audioEngine';

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

interface AudioPlayerProps {
  sketch: ApiSketch;
  sketchPeaks?: number[] | null;
  onTimeUpdate?: (timeSeconds: number) => void;
  onNoteAdded?: () => void;
  transport?: Transport;
}

export interface AudioPlayerHandle {
  seek: (seconds: number) => void;
}

const formatTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
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
  { sketch, sketchPeaks, onTimeUpdate, onNoteAdded, transport },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const audioUrl = sketchesApi.audioUrl(sketch.id);
  const [loopMode, setLoopMode] = useState<LoopMode>('off');
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addNoteContent, setAddNoteContent] = useState('');
  const [addNoteLoading, setAddNoteLoading] = useState(false);
  const onceRepeatedRef = useRef(false);

  const useTransport = !!transport;
  const displayTime = useTransport ? transport.currentTime : 0;
  const displayPlaying = useTransport ? transport.isPlaying : false;
  const displayDuration = useTransport ? transport.duration : sketch.durationSeconds ?? 0;

  const [audioError, setAudioError] = useState<string | null>(null);

  const hasPeaksAndDuration = !!(sketchPeaks && sketchPeaks.length > 0 && sketch.durationSeconds && sketch.durationSeconds > 0);
  const stablePeaks = useMemo(
    () => hasPeaksAndDuration ? [sketchPeaks!] : undefined,
    [hasPeaksAndDuration, sketchPeaks]
  );

  const { wavesurfer, isReady, isPlaying, currentTime } = useWavesurfer({
    container: containerRef,
    url: audioUrl,
    peaks: stablePeaks,
    duration: stablePeaks ? sketch.durationSeconds : undefined,
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

  useEffect(() => {
    if (!wavesurfer) return;
    const onError = (err: Error) => {
      console.error('[AudioPlayer] decode error:', err);
      setAudioError('This audio format is not supported by your browser. Try re-uploading as MP3 or WAV.');
    };
    wavesurfer.on('error', onError);
    return () => { wavesurfer.un('error', onError); };
  }, [wavesurfer]);

  useImperativeHandle(ref, () => ({
    seek(seconds: number) {
      if (useTransport) {
        transport?.seek(seconds);
        return;
      }
      if (!wavesurfer || !isReady) return;
      const dur = wavesurfer.getDuration();
      const effectiveDur = Number.isFinite(dur) && dur > 0 ? dur : (sketch.durationSeconds ?? 0);
      if (effectiveDur > 0) wavesurfer.seekTo(Math.max(0, Math.min(1, seconds / effectiveDur)));
    },
  }), [wavesurfer, isReady, useTransport, transport, sketch.durationSeconds]);

  useEffect(() => {
    if (useTransport) onTimeUpdate?.(transport?.currentTime ?? 0);
    else onTimeUpdate?.(currentTime);
  }, [useTransport, useTransport ? transport?.currentTime : currentTime, onTimeUpdate]);

  const prevUseTransportRef = useRef(useTransport);
  useEffect(() => {
    if (!wavesurfer || !isReady) return;
    const media = wavesurfer.getMediaElement();
    if (!media) return;
    if (useTransport) {
      if (!prevUseTransportRef.current) {
        wavesurfer.pause();
        wavesurfer.setTime(0);
      }
      prevUseTransportRef.current = true;
      media.volume = 0;
      return;
    }
    prevUseTransportRef.current = false;
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

  const transportRef = useRef(transport);
  transportRef.current = transport;

  useEffect(() => {
    if (!useTransport || !wavesurfer) return;
    const visualOk = isReady || !!stablePeaks;
    if (!visualOk) return;
    let rafId: number;
    const sync = () => {
      const t = transportRef.current?.currentTime ?? 0;
      const dur = wavesurfer.getDuration();
      const effectiveDur = Number.isFinite(dur) && dur > 0 ? dur : (sketch.durationSeconds ?? 0);
      if (effectiveDur > 0) {
        const progress = Math.max(0, Math.min(1, t / effectiveDur));
        // Bypass wavesurfer.seekTo() which breaks when media hasn't loaded
        // (getDuration() returns 0 → progress becomes NaN in renderer).
        // Instead, render the progress bar directly.
        const renderer = (wavesurfer as any).renderer;
        if (renderer?.renderProgress) {
          renderer.renderProgress(progress, !!transportRef.current?.isPlaying);
        }
      }
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafId);
  }, [useTransport, wavesurfer, isReady, stablePeaks, sketch.durationSeconds]);

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
  const wsDuration = wavesurfer && isReady ? wavesurfer.getDuration() : 0;
  const duration = useTransport
    ? displayDuration
    : (Number.isFinite(wsDuration) && wsDuration > 0 ? wsDuration : sketch.durationSeconds ?? 0);
  const visuallyReady = isReady || !!stablePeaks;
  const showAddNote = ((useTransport ? displayTime : currentTime) > 0 || (useTransport ? displayPlaying : isPlaying)) && visuallyReady;

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

  return (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={() => (useTransport ? (displayPlaying ? transport?.pause() : transport?.play()) : wavesurfer?.playPause())}
        disabled={!visuallyReady}
        aria-label={displayPlaying || isPlaying ? 'Pause' : 'Play'}
        className="flex items-center justify-center w-11 h-11 rounded-full bg-elevated text-text hover:bg-hover hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {(displayPlaying || isPlaying) ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
      </button>
      <div className="min-h-[56px] flex-1 min-w-0 rounded-md overflow-hidden relative">
        <div ref={containerRef} className="min-h-[56px] w-full relative z-0" />
        {audioError ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-surface/80">
            <p className="text-xs text-danger px-4 text-center">{audioError}</p>
          </div>
        ) : !isReady && !stablePeaks ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-md"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : null}
      </div>
      <div className={`flex items-center shrink-0 transition-opacity duration-200 ${showAddNote ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="relative">
          <button
            ref={addNoteButtonRef}
            type="button"
            onClick={() => setAddNoteOpen((open) => !open)}
            aria-label="Add note at current time"
            aria-expanded={addNoteOpen}
            disabled={!visuallyReady}
            className="flex items-center justify-center w-9 h-9 rounded-full text-secondary hover:text-text hover:bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
        disabled={!visuallyReady}
        aria-label={LOOP_LABELS[effectiveLoopMode]}
        className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
