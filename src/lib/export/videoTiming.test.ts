import { describe, expect, it } from 'vitest';
import { frameTime, lengthForSpeed, planTiming, speedForLength } from './videoTiming';
import { bitrateFor, clampFps, clampSide, presetSize, ASPECTS } from './videoFormat';

const MIN = 60_000;
const range = { inMs: 1_000_000, outMs: 1_000_000 + 10 * MIN };

describe('planTiming', () => {
  it('fits the range into the target length', () => {
    const t = planTiming(range, { kind: 'length', seconds: 30 }, 30);
    expect(t.frames).toBe(900);
    expect(t.speed).toBeCloseTo(20, 9);
    expect(t.seconds).toBe(30);
  });

  it('rounds the frame count up', () => {
    // 10 s at 3 fps is exactly 30 frames, 10.1 s needs one more.
    const exact = planTiming({ inMs: 0, outMs: 10_000 }, { kind: 'length', seconds: 10 }, 3);
    expect(exact.frames).toBe(30);
    const over = planTiming({ inMs: 0, outMs: 10_100 }, { kind: 'speed', factor: 1 }, 3);
    expect(over.frames).toBe(31);
  });

  it('counts frames from the speed factor', () => {
    const t = planTiming(range, { kind: 'speed', factor: 60 }, 30);
    // 600 s of replay at 60x is 10 s of video, 300 frames.
    expect(t.frames).toBe(300);
    expect(t.seconds).toBe(10);
  });

  it('rejects an empty or inverted range', () => {
    expect(() => planTiming({ inMs: 5, outMs: 5 }, { kind: 'speed', factor: 10 }, 30)).toThrow(/empty/);
    expect(() => planTiming({ inMs: 9, outMs: 5 }, { kind: 'speed', factor: 10 }, 30)).toThrow(/empty/);
  });

  it('rejects a zero length or speed', () => {
    expect(() => planTiming(range, { kind: 'length', seconds: 0 }, 30)).toThrow();
    expect(() => planTiming(range, { kind: 'speed', factor: 0 }, 30)).toThrow();
  });
});

describe('frameTime', () => {
  it('steps by speed over fps, starting at the in mark', () => {
    const t = planTiming(range, { kind: 'speed', factor: 60 }, 30);
    expect(frameTime(range, t, 30, 0)).toBe(range.inMs);
    expect(frameTime(range, t, 30, 1)).toBeCloseTo(range.inMs + 2000, 6);
    expect(frameTime(range, t, 30, t.frames - 1)).toBeLessThanOrEqual(range.outMs);
  });
});

describe('derived values', () => {
  it('converts between length and speed', () => {
    expect(lengthForSpeed(10 * MIN, 120)).toBe(5);
    expect(speedForLength(10 * MIN, 60)).toBe(10);
  });
});

describe('presetSize', () => {
  it('uses the short side for each aspect', () => {
    expect(presetSize(ASPECTS[0], 1080)).toEqual({ width: 1920, height: 1080 });
    expect(presetSize(ASPECTS[1], 1080)).toEqual({ width: 1080, height: 1920 });
    expect(presetSize(ASPECTS[2], 720)).toEqual({ width: 720, height: 720 });
    expect(presetSize(ASPECTS[0], 2160)).toEqual({ width: 3840, height: 2160 });
  });
});

describe('clampSide and clampFps', () => {
  it('makes sides even and within 320 to 4096', () => {
    expect(clampSide(1081)).toBe(1082);
    expect(clampSide(100)).toBe(320);
    expect(clampSide(9000)).toBe(4096);
    expect(clampSide(null)).toBe(320);
  });

  it('clamps fps to 1 to 60', () => {
    expect(clampFps(0)).toBe(1);
    expect(clampFps(90)).toBe(60);
    expect(clampFps(24.4)).toBe(24);
    expect(clampFps(null)).toBe(30);
  });
});

describe('bitrateFor', () => {
  it('scales with pixels and frame rate, within limits', () => {
    expect(bitrateFor(1920, 1080, 30)).toBeGreaterThan(bitrateFor(1280, 720, 30));
    expect(bitrateFor(1920, 1080, 30)).toBe(18_662_400);
    expect(bitrateFor(7680, 4320, 60)).toBe(100_000_000);
    expect(bitrateFor(320, 320, 1)).toBe(1_000_000);
    expect(bitrateFor(1920, 1080, 30, 'max')).toBe(2 * bitrateFor(1920, 1080, 30));
    expect(bitrateFor(1920, 1080, 30, 'standard')).toBe(bitrateFor(1920, 1080, 30) / 2);
  });
});
