// Domain benchmarks on a realistic long flight. Run with `npm run bench`, not part of CI.
// Budgets: import + analysis of an 8 h flight under 1 s, any main-thread step under 50 ms.
import { describe, expect, test } from 'vitest';

import { analyzeFlight } from '../domain/analysis/analyze';
import { directCamera } from '../domain/director';
import { writeGpx } from '../domain/formats/gpx';
import { readIgc, writeIgc } from '../domain/formats/igc';
import { breakdown, totals } from '../domain/logbook';
import { routeFromFlight } from '../domain/routeFromFlight';
import { smoothPath } from '../domain/smooth';
import { buildIgc } from '../domain/testing/igc-builder';
import { chain, circle, straight } from '../domain/testing/tracks';
import { positionAt, resampleAltitudes } from '../domain/timeline';

// 8 h at 1 Hz: 48 cycles of a 5 min thermal and a 5 min glide, about 28 800 fixes.
const cycle = [
  (s: Parameters<typeof circle>[0]) => circle(s, { radius: 40, period: 22, climb: 2, duration: 300 }),
  (s: Parameters<typeof straight>[0]) => straight(s, { headingDeg: 60, speed: 11, climb: -2, duration: 300 })
];
const fixes = chain(...Array.from({ length: 48 }, () => cycle).flat());
const day = Date.UTC(2026, 6, 15);
const igc = buildIgc(
  fixes.map((f) => ({ sec: (f.t - day) / 1000, lat: f.lat, lon: f.lon, gpsAlt: f.alt })),
  { date: '150726' }
);
const flight = readIgc(igc, 'long.igc');
const analysis = analyzeFlight(flight);
const range = { inMs: fixes[0].t, outMs: fixes[fixes.length - 1].t };

// [name, work, budget in ms for one call]. Import and analysis share the 1 s budget.
const cases: [string, () => unknown, number][] = [
  ['readIgc', () => readIgc(igc, 'long.igc'), 500],
  ['analyzeFlight', () => analyzeFlight(flight), 500],
  ['smoothPath', () => smoothPath(flight.fixes), 50],
  ['resampleAltitudes x3 pilots', () => resampleAltitudes([fixes, fixes, fixes], 1), 50],
  [
    'positionAt x1000 (seek)',
    () => {
      for (let i = 0; i < 1000; i++) positionAt(fixes, range.inMs + ((range.outMs - range.inMs) * i) / 1000);
    },
    16
  ],
  ['directCamera', () => directCamera(flight, analysis.phases, range), 50],
  ['routeFromFlight', () => routeFromFlight(fixes, 5), 50],
  ['writeIgc', () => writeIgc(flight), 100],
  ['writeGpx', () => writeGpx(flight), 100]
];

describe(`8 h flight, ${fixes.length} fixes`, () => {
  test.for(cases)('%s', async ([name, work, budget], { bench }) => {
    const result = await bench(name, () => void work()).run();
    console.log(`${name}: ${result.latency.mean.toFixed(2)} ms (budget ${budget})`);
    expect(result.latency.mean, `${name} mean ms`).toBeLessThan(budget);
  });
});

// Logbook with 300 flights, summaries only like the IndexedDB listing.
const logged = Array.from({ length: 300 }, (_, i) => {
  const startTime = day - i * 86_400_000;
  return {
    id: String(i),
    date: new Date(startTime).toISOString().slice(0, 10),
    startTime,
    endTime: startTime + (3600 + (i % 7) * 1800) * 1000,
    site: `Site ${i % 12}`,
    glider: `Glider ${i % 3}`
  };
});

test('logbook, 300 flights: totals + breakdown', async ({ bench }) => {
  const result = await bench('logbook', () => {
    totals(logged);
    breakdown(logged, 'site');
  }).run();
  console.log(`logbook: ${result.latency.mean.toFixed(2)} ms (budget 16)`);
  expect(result.latency.mean).toBeLessThan(16);
});
