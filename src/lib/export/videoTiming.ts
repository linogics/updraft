/** Replay range and timing of a video export. Times are Unix ms on the replay clock. */

export interface ReplayRange {
  inMs: number;
  outMs: number;
}

/** Either the video length in seconds or the replay speed, in replay seconds per video second. */
export type TimingMode = { kind: 'length'; seconds: number } | { kind: 'speed'; factor: number };

export interface Timing {
  frames: number;
  /** Replay ms per video ms. */
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

export function planTiming(range: ReplayRange, mode: TimingMode, fps: number): Timing {
  const rangeMs = range.outMs - range.inMs;
  if (!(rangeMs > 0)) throw new Error('The export range is empty. Set the out mark after the in mark.');
  const speed = mode.kind === 'speed' ? mode.factor : speedForLength(rangeMs, mode.seconds);
  if (!(speed > 0) || !Number.isFinite(speed)) throw new Error('Enter a length or speed above zero.');
  // The epsilon keeps float noise (450.00000001) from adding a frame.
  const frames = Math.max(1, Math.ceil(lengthForSpeed(rangeMs, speed) * fps - 1e-6));
  return { frames, speed, seconds: frames / fps };
}

/** Replay time of output frame k. */
export function frameTime(range: ReplayRange, timing: Timing, fps: number, k: number): number {
  return range.inMs + (k * timing.speed * 1000) / fps;
}
