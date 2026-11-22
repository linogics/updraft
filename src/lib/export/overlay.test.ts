import { describe, expect, it } from 'vitest';
import { ALL_PARTS, overlayLayout, type Rect, type OverlayParts } from './overlay';

const NONE: OverlayParts = { hud: false, altitudeGraph: false, stats: false, minimap: false, credits: false };

const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function rects(w: number, h: number, parts: OverlayParts): Rect[] {
  const l = overlayLayout(w, h, parts);
  return [l.hud, l.altitudeGraph, l.stats, l.minimap, l.credits].filter((r): r is Rect => r !== null);
}

describe('overlayLayout', () => {
  it('keeps every panel inside the frame and apart from the others', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [1080, 1080],
      [320, 320],
      [4096, 2304]
    ]) {
      const all = rects(w, h, ALL_PARTS);
      expect(all).toHaveLength(5);
      all.forEach((r) => expect(inside(r, w, h)).toBe(true));
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
      }
    }
  });

  it('puts panels in the corners for landscape', () => {
    const l = overlayLayout(1920, 1080, ALL_PARTS);
    expect(l.hud!.x).toBeLessThan(960);
    expect(l.hud!.y).toBeLessThan(540);
    expect(l.stats!.x).toBeGreaterThan(960);
    expect(l.stats!.y).toBeLessThan(540);
    expect(l.minimap!.x).toBeGreaterThan(960);
    expect(l.minimap!.y).toBeGreaterThan(540);
  });

  it('stacks panels top to bottom for portrait', () => {
    const l = overlayLayout(1080, 1920, ALL_PARTS);
    expect(l.hud!.y).toBeLessThan(l.stats!.y);
    expect(l.stats!.y).toBeLessThan(l.minimap!.y);
    expect(l.minimap!.y).toBeLessThan(l.altitudeGraph!.y);
    expect(l.altitudeGraph!.y).toBeLessThan(l.credits!.y);
  });

  it('scales with the short side', () => {
    expect(overlayLayout(1920, 1080, ALL_PARTS).scale).toBe(1);
    expect(overlayLayout(540, 1080, ALL_PARTS).scale).toBe(0.5);
    expect(overlayLayout(1080, 1920, ALL_PARTS).scale).toBe(1);
  });

  it('returns null for disabled parts and leaves the rest in place', () => {
    const l = overlayLayout(1080, 1080, { ...ALL_PARTS, credits: false, minimap: false });
    expect(l.credits).toBeNull();
    expect(l.minimap).toBeNull();
    expect(l.hud).not.toBeNull();
    expect(l.stats).not.toBeNull();
    expect(l.altitudeGraph).not.toBeNull();
  });

  it('returns no panels when everything is off', () => {
    const l = overlayLayout(1920, 1080, NONE);
    expect([l.hud, l.altitudeGraph, l.stats, l.minimap, l.credits].every((r) => r === null)).toBe(true);
  });
});
