import { describe, expect, it } from 'vitest';
import { locate, sampleBilinear } from './groundHeights';

describe('sampleBilinear', () => {
  const map = Float32Array.from([0, 10, 20, 30]); // 2x2: rows [0 10] [20 30]

  it('returns exact pixel values at integer coordinates', () => {
    expect(sampleBilinear(map, 2, 1, 0)).toBe(10);
    expect(sampleBilinear(map, 2, 0, 1)).toBe(20);
  });

  it('interpolates between pixels', () => {
    expect(sampleBilinear(map, 2, 0.5, 0)).toBe(5);
    expect(sampleBilinear(map, 2, 0.5, 0.5)).toBe(15);
  });

  it('stays inside the last row and column', () => {
    expect(sampleBilinear(map, 2, 1, 1)).toBe(30);
  });
});

describe('locate', () => {
  it('maps the origin to the top-left corner of tile 0', () => {
    expect(locate(0, -180, 1)).toEqual({ x: 0, y: 1, px: 0, py: 0 });
  });

  it('maps lat/lon to Web Mercator tiles and pixels', () => {
    // z1: lon 0 is the tile seam, lat 0 is the equator (tile row boundary).
    const p = locate(0, 0, 1);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
    expect(p.px).toBeCloseTo(0, 6);
    expect(p.py).toBeCloseTo(0, 6);
  });

  it('places a point inside its tile', () => {
    const p = locate(47.0, 8.0, 13);
    expect(p.px).toBeGreaterThanOrEqual(0);
    expect(p.px).toBeLessThan(256);
    expect(p.py).toBeGreaterThanOrEqual(0);
    expect(p.py).toBeLessThan(256);
  });
});
