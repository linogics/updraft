import { describe, expect, it } from 'vitest';
import { distance } from '../domain/geo';
import { ring } from './ring';

describe('ring', () => {
  it('is closed and every point sits at the radius', () => {
    const c = { lat: 47, lon: 11 };
    const r = ring(c, 300);
    expect(r[0]).toEqual(r.at(-1));
    for (const p of r) expect(distance(c, p)).toBeCloseTo(300, -1);
  });
});
