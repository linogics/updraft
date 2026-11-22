/** Output size, frame rate and bitrate of a video export. */

export const MIN_SIDE = 320;
export const MAX_SIDE = 4096;
export const MIN_FPS = 1;
export const MAX_FPS = 60;

export const ASPECTS = [
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '1:1', label: '1:1', w: 1, h: 1 }
] as const;
export type Aspect = (typeof ASPECTS)[number];

export const SHORT_SIDES = [
  { label: '720p', short: 720 },
  { label: '1080p', short: 1080 },
  { label: '4K', short: 2160 }
];

const even = (v: number) => Math.round(v / 2) * 2;

/** Size for an aspect with the given short side. Both sides are even, as H.264 needs. */
export function presetSize(aspect: Aspect, short: number): { width: number; height: number } {
  if (aspect.w >= aspect.h) return { width: even((short * aspect.w) / aspect.h), height: short };
  return { width: short, height: even((short * aspect.h) / aspect.w) };
}

/** Clamps a typed side to the allowed range and makes it even. NaN falls back to the minimum. */
export function clampSide(v: number | null | undefined): number {
  const n = Number.isFinite(v) ? even(v!) : MIN_SIDE;
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, n));
}

export function clampFps(v: number | null | undefined): number {
  const n = Number.isFinite(v) ? Math.round(v!) : 30;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, n));
}

/** Target H.264 bitrate, bits per second: about 0.1 bit per pixel per frame, clamped. */
export function bitrateFor(width: number, height: number, fps: number): number {
  return Math.min(50_000_000, Math.max(1_000_000, Math.round(width * height * fps * 0.1)));
}
