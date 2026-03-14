export interface Track {
  id: string;
  url: string;
  offsetMs: number;
  volume: number;
  muted: boolean;
}

interface LoadedTrack {
  id: string;
  buffer: AudioBuffer;
  offsetMs: number;
  gainNode: GainNode;
  source: AudioBufferSourceNode | null;
  volume: number;
  muted: boolean;
}

type EngineState = 'stopped' | 'playing' | 'paused';

export type LoopMode = 'off' | 'once' | 'infinite';

export class AudioEngine {
  private ctx: AudioContext;
  private tracks = new Map<string, LoadedTrack>();
  private state: EngineState = 'stopped';
  private startedAt = 0;
  private pausedAt = 0;
  private masterGain: GainNode;
  private onStateChange?: () => void;
  private onTimeUpdate?: (time: number) => void;
  private animFrameId: number | null = null;
  private soloTrackId: string | null = null;
  private _loopMode: LoopMode = 'off';
  private onceRepeated = false;

  constructor(onStateChange?: () => void, onTimeUpdate?: (time: number) => void) {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.onStateChange = onStateChange;
    this.onTimeUpdate = onTimeUpdate;
  }

  get isPlaying() { return this.state === 'playing'; }
  get isPaused() { return this.state === 'paused'; }
  get loopMode() { return this._loopMode; }
  set loopMode(mode: LoopMode) {
    this._loopMode = mode;
    if (mode !== 'once') this.onceRepeated = false;
  }
  get duration(): number {
    const sketch = this.tracks.get('sketch');
    return sketch ? sketch.buffer.duration : 0;
  }
  get currentTime() {
    if (this.state === 'playing') return this.ctx.currentTime - this.startedAt;
    return this.pausedAt;
  }

  async loadTrack(track: Track): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const response = await fetch(track.url);
    const arrayBuf = await response.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(arrayBuf);

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = track.muted ? 0 : track.volume;
    gainNode.connect(this.masterGain);

    this.tracks.set(track.id, {
      id: track.id,
      buffer,
      offsetMs: track.offsetMs,
      gainNode,
      source: null,
      volume: track.volume,
      muted: track.muted,
    });
  }

  removeTrack(id: string) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.source?.stop();
    t.gainNode.disconnect();
    this.tracks.delete(id);
    if (this.soloTrackId === id) {
      this.soloTrackId = null;
      this.applySoloMute();
    }
  }

  updateTrackOffset(id: string, offsetMs: number) {
    const t = this.tracks.get(id);
    if (t) t.offsetMs = offsetMs;
    if (this.state === 'playing') {
      this.pause();
      this.play();
    }
  }

  setTrackVolume(id: string, volume: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.volume = volume;
    if (!t.muted && this.soloTrackId !== null && this.soloTrackId !== id) return;
    if (!t.muted) t.gainNode.gain.value = volume;
  }

  muteTrack(id: string, muted: boolean) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.muted = muted;
    this.applySoloMute();
  }

  soloTrack(id: string | null) {
    this.soloTrackId = id;
    this.applySoloMute();
  }

  private applySoloMute() {
    for (const t of this.tracks.values()) {
      if (this.soloTrackId !== null) {
        t.gainNode.gain.value = t.id === this.soloTrackId && !t.muted ? t.volume : 0;
      } else {
        t.gainNode.gain.value = t.muted ? 0 : t.volume;
      }
    }
  }

  async play() {
    if (this._loopMode === 'once') this.onceRepeated = false;
    return this.doPlay();
  }

  private async doPlay() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.state === 'playing') return;

    const offset = this.pausedAt;
    this.startedAt = this.ctx.currentTime - offset;

    for (const t of this.tracks.values()) {
      t.source?.stop();
      const source = this.ctx.createBufferSource();
      source.buffer = t.buffer;
      source.connect(t.gainNode);

      const trackStartSec = t.offsetMs / 1000;
      const playFrom = offset - trackStartSec;

      if (playFrom >= 0 && playFrom < t.buffer.duration) {
        source.start(0, playFrom);
      } else if (playFrom < 0) {
        source.start(this.ctx.currentTime + Math.abs(playFrom), 0);
      }
      t.source = source;
    }

    this.state = 'playing';
    this.onStateChange?.();
    this.startTimeLoop();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.pausedAt = this.ctx.currentTime - this.startedAt;
    for (const t of this.tracks.values()) {
      t.source?.stop();
      t.source = null;
    }
    this.state = 'paused';
    this.onStateChange?.();
    this.stopTimeLoop();
  }

  seek(time: number) {
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      for (const t of this.tracks.values()) {
        t.source?.stop();
        t.source = null;
      }
      this.stopTimeLoop();
    }
    this.pausedAt = Math.max(0, time);
    this.state = 'paused';
    if (wasPlaying) this.doPlay();
    this.onTimeUpdate?.(this.pausedAt);
  }

  stop() {
    for (const t of this.tracks.values()) {
      t.source?.stop();
      t.source = null;
    }
    this.pausedAt = 0;
    this.state = 'stopped';
    this.onStateChange?.();
    this.stopTimeLoop();
    this.onTimeUpdate?.(0);
  }

  private startTimeLoop() {
    const loop = () => {
      if (this.state !== 'playing') return;
      const t = this.currentTime;
      const dur = this.duration;
      this.onTimeUpdate?.(t);
      if (dur > 0 && t >= dur - 0.05) {
        if (this._loopMode === 'infinite') {
          this.seek(0);
          this.play();
        } else if (this._loopMode === 'once' && !this.onceRepeated) {
          this.onceRepeated = true;
          this.seek(0);
          this.doPlay();
        } else {
          this.pause();
          this.pausedAt = 0;
          this.onTimeUpdate?.(0);
        }
        return;
      }
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopTimeLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  async destroy() {
    this.stop();
    for (const t of this.tracks.values()) {
      t.gainNode.disconnect();
    }
    this.tracks.clear();
    this.masterGain.disconnect();
    await this.ctx.close();
  }
}
