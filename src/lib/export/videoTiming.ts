/** Playback range and timing of a video export. Times are Unix ms on the playback clock. */

import { m } from '../paraglide/messages';

export interface StudioRange {
  inMs: number;
  outMs: number;
}

/** Either the video length in seconds or the playback speed, in playback seconds per video second. */
export type TimingMode = { kind: 'length'; seconds: number } | { kind: 'speed'; factor: number };

export interface Timing {
  frames: number;
  /** Studio ms per video ms. */
  speed: number;
  /** Video length in seconds, frames / fps. */
  seconds: number;
}

export const LENGTH_PRESETS = [15, 30, 60, 90];
export const SPEED_PRESETS = [10, 30, 60, 120];

/** Speed that fits the range into a video of this many seconds. */
export function speedForLength(rangeMs: number, seconds: number): number {
  return rangeMs / (seconds * 1000);
}

/** Video seconds the range takes at this speed. */
export function lengthForSpeed(rangeMs: number, factor: number): number {
  return rangeMs / (factor * 1000);
}

export function planTiming(range: StudioRange, mode: TimingMode, fps: number): Timing {
  const rangeMs = range.outMs - range.inMs;
  if (!(rangeMs > 0)) throw new Error(m.export_range_empty());
  const speed = mode.kind === 'speed' ? mode.factor : speedForLength(rangeMs, mode.seconds);
  if (!(speed > 0) || !Number.isFinite(speed)) throw new Error(m.export_speed_invalid());
  // The epsilon keeps float noise (450.00000001) from adding a frame.
  const frames = Math.max(1, Math.ceil(lengthForSpeed(rangeMs, speed) * fps - 1e-6));
  return { frames, speed, seconds: frames / fps };
}

/** Playback time of output frame k. */
export function frameTime(range: StudioRange, timing: Timing, fps: number, k: number): number {
  return range.inMs + (k * timing.speed * 1000) / fps;
}
