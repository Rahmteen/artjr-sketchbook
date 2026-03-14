/**
 * Decode an audio URL and return peak data for a given duration.
 * Peaks are downsampled to numBars (e.g. 200) for the waveform strip.
 * For melodies: offsetMs and durationSeconds define the active range; rest is silence.
 */

const DEFAULT_BARS = 256;

export interface PeakOptions {
  /** Total duration in seconds to span (e.g. sketch duration) */
  durationSeconds: number;
  /** Start offset of this audio within the timeline (ms). Default 0 */
  offsetMs?: number;
  /** Length of the actual audio in seconds. If less than durationSeconds, rest is zero. */
  sourceDurationSeconds?: number;
  /** Number of peak buckets. Default 256 */
  numBars?: number;
}

/**
 * Fetch audio, decode with AudioContext, return array of peak values (0..1) over durationSeconds.
 * Values are 0 where the source has no content (before offset or after source end).
 */
export async function getPeaks(
  audioUrl: string,
  options: PeakOptions,
  ctx?: AudioContext
): Promise<number[]> {
  const {
    durationSeconds,
    offsetMs = 0,
    sourceDurationSeconds,
    numBars = DEFAULT_BARS,
  } = options;

  const ac = ctx ?? new AudioContext();
  if (ac.state === 'suspended') await ac.resume();

  const response = await fetch(audioUrl);
  const arrayBuf = await response.arrayBuffer();
  const buffer = await ac.decodeAudioData(arrayBuf);

  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const srcDuration = sourceDurationSeconds ?? buffer.duration;
  const startSec = offsetMs / 1000;
  const endSec = startSec + srcDuration;
  const peaks: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const t = (i / numBars) * durationSeconds;
    if (t < startSec || t >= endSec) {
      peaks.push(0);
      continue;
    }
    const localT = t - startSec;
    const nextT = ((i + 1) / numBars) * durationSeconds;
    const nextLocalT = Math.min(nextT - startSec, srcDuration);
    const startSample = Math.floor(localT * sampleRate);
    const endSample = Math.min(
      Math.ceil(nextLocalT * sampleRate),
      Math.floor(srcDuration * sampleRate),
      buffer.length
    );
    let max = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const channel = buffer.getChannelData(ch);
      for (let s = startSample; s < endSample && s < channel.length; s++) {
        const v = Math.abs(channel[s]);
        if (v > max) max = v;
      }
    }
    peaks.push(max);
  }

  const globalMax = Math.max(...peaks, 1e-6);
  for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / globalMax;

  if (!ctx) await ac.close();
  return peaks;
}
