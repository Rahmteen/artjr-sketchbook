/**
 * Server-side peak computation for melody waveforms.
 * Decodes audio buffer and returns normalized peak array (256 bars over duration).
 */

import decode from 'audio-decode';

const DEFAULT_NUM_BARS = 256;

/**
 * Compute peak values (0..1) over the given duration, one value per bar.
 * Uses the same downsampling logic as client getPeaks for consistency.
 */
export async function computePeaksFromBuffer(
  buffer: Buffer,
  durationSeconds: number,
  numBars: number = DEFAULT_NUM_BARS
): Promise<{ peaks: number[]; srcDuration: number }> {
  if (numBars <= 0) return { peaks: [], srcDuration: 0 };

  const buf = new Uint8Array(buffer);
  const { channelData, sampleRate } = await decode(buf);

  const srcDuration = channelData[0] ? channelData[0].length / sampleRate : 0;
  const duration = durationSeconds > 0 ? Math.min(durationSeconds, srcDuration) : srcDuration;
  if (duration <= 0) return { peaks: [], srcDuration };

  const peaks: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const t = (i / numBars) * duration;
    if (t >= srcDuration) {
      peaks.push(0);
      continue;
    }
    const nextT = ((i + 1) / numBars) * duration;
    const nextLocalT = Math.min(nextT, srcDuration);
    const startSample = Math.floor(t * sampleRate);
    const endSample = Math.min(
      Math.ceil(nextLocalT * sampleRate),
      Math.floor(srcDuration * sampleRate)
    );
    let max = 0;
    for (const channel of channelData) {
      for (let s = startSample; s < endSample && s < channel.length; s++) {
        const v = Math.abs(channel[s]);
        if (v > max) max = v;
      }
    }
    peaks.push(max);
  }

  const globalMax = Math.max(...peaks, 1e-6);
  for (let i = 0; i < peaks.length; i++) peaks[i] = peaks[i] / globalMax;

  return { peaks, srcDuration };
}
