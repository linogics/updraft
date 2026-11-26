import { describe, expect, it } from 'vitest';

import { distance } from './geo';
import { routeFromFlight } from './routeFromFlight';
import { straight } from './testing/tracks';

const start = { t: 0, lat: 47, lon: 8, alt: 1000 };
const out = straight(start, { headingDeg: 90, speed: 10, climb: 0, duration: 100 });
const back = straight({ ...out[out.length - 1], t: 101_000 }, { headingDeg: 270, speed: 10, climb: 0, duration: 100 });
const track = [...out, ...back];

describe('routeFromFlight', () => {
  it('out and back with one turnpoint', () => {
    const r = routeFromFlight(track, 1);
    expect(r).toHaveLength(3);
    expect(distance(r[0], r[1])).toBeGreaterThan(900);
    expect(distance(r[1], r[2])).toBeGreaterThan(900);
  });
  it('returns turnpoints + 2 points in time order', () => {
    const r = routeFromFlight(out, 5);
    expect(r).toHaveLength(7);
    for (let i = 1; i < r.length; i++) expect(r[i].lon).toBeGreaterThan(r[i - 1].lon);
  });
  it('tiny track does not crash', () => {
    expect(routeFromFlight(out.slice(0, 2), 3)).toHaveLength(2);
    expect(routeFromFlight([], 3)).toEqual([]);
  });
});
