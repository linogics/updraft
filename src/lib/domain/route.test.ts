import { describe, expect, it } from 'vitest';
import { decodeRoute, densify, encodeRoute, MAX_ROUTE_POINTS } from './route';

describe('route codec', () => {
  it('round trips with 5 decimals', () => {
    const pts = [
      { lat: 46.12345, lon: 7.12345 },
      { lat: -33.5, lon: -70.25 }
    ];
    expect(encodeRoute(pts)).toBe('46.12345,7.12345~-33.50000,-70.25000');
    expect(decodeRoute(encodeRoute(pts))).toEqual(pts);
  });
  it('ignores invalid input', () => {
    expect(decodeRoute(null)).toEqual([]);
    expect(decodeRoute('')).toEqual([]);
    expect(decodeRoute('a,b~91,0~0,181~1,2,3~,5~46.2,7.3')).toEqual([{ lat: 46.2, lon: 7.3 }]);
  });
  it('caps the point count', () => {
    const raw = Array.from({ length: 150 }, () => '1,2').join('~');
    expect(decodeRoute(raw)).toHaveLength(MAX_ROUTE_POINTS);
  });
});

describe('densify', () => {
  it('keeps every point and adds steps per leg', () => {
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 2 },
      { lat: 2, lon: 2 }
    ];
    const out = densify(pts, 4);
    expect(out).toHaveLength(9);
    expect(out[0]).toEqual(pts[0]);
    expect(out[4]).toEqual(pts[1]);
    expect(out[8]).toEqual(pts[2]);
    expect(out[2]).toEqual({ lat: 0.5, lon: 1 });
  });

  it('leaves a single point alone', () => {
    expect(densify([{ lat: 1, lon: 1 }])).toEqual([{ lat: 1, lon: 1 }]);
  });
});
