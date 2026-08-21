import { describe, expect, it } from 'vitest';
import { parseIgc } from './igc';
import { buildIgc } from './testing/igc-builder';

const base = { lat: 47.5, lon: 11.1 };

describe('parseIgc', () => {
  it('maps header and fixes into a Flight', () => {
    const text = buildIgc(
      [
        { sec: 36000, ...base, gpsAlt: 1500 },
        { sec: 36001, ...base, gpsAlt: 1502 }
      ],
      { pilot: 'Jane Doe', glider: 'Ozone Rush 6', date: '150726' }
    );

    const flight = parseIgc(text, { id: 'f1', sourceName: 'jane.igc' });

    expect(flight.id).toBe('f1');
    expect(flight.sourceName).toBe('jane.igc');
    expect(flight.pilot).toBe('Jane Doe');
    expect(flight.glider).toBe('Ozone Rush 6');
    expect(flight.date).toBe('2026-07-15');
    expect(flight.fixes).toHaveLength(2);
    expect(flight.fixes[0]).toMatchObject({ lat: 47.5, lon: 11.1, alt: 1500 });
    expect(flight.fixes[0].t).toBe(Date.UTC(2026, 6, 15, 10, 0, 0));
  });

  it('prefers GPS altitude and falls back to pressure altitude when GPS altitude is 0', () => {
    const text = buildIgc([
      { sec: 36000, ...base, gpsAlt: 0, pressureAlt: 1400 },
      { sec: 36001, ...base, gpsAlt: 1510, pressureAlt: 1405 }
    ]);

    const flight = parseIgc(text, { id: 'f', sourceName: 'x.igc' });

    expect(flight.fixes.map((f) => f.alt)).toEqual([1400, 1510]);
  });

  it('drops fixes flagged invalid', () => {
    const text = buildIgc([
      { sec: 36000, ...base, gpsAlt: 1500 },
      { sec: 36001, ...base, gpsAlt: 1500, valid: false },
      { sec: 36002, ...base, gpsAlt: 1500 }
    ]);

    expect(parseIgc(text, { id: 'f', sourceName: 'x.igc' }).fixes).toHaveLength(2);
  });

  it('keeps timestamps increasing across midnight UTC', () => {
    const text = buildIgc([
      { sec: 86399, ...base, gpsAlt: 1500 },
      { sec: 86400, ...base, gpsAlt: 1500 }
    ]);

    const [a, b] = parseIgc(text, { id: 'f', sourceName: 'x.igc' }).fixes;

    expect(b.t - a.t).toBe(1000);
  });

  it('throws when the file has no usable fixes', () => {
    expect(() => parseIgc(buildIgc([]), { id: 'f', sourceName: 'empty.igc' })).toThrow(/no valid fixes/i);
  });

  it('falls back to the file name when the pilot header is missing', () => {
    const text = buildIgc([{ sec: 36000, ...base, gpsAlt: 1500 }], { pilot: '' });

    expect(parseIgc(text, { id: 'f', sourceName: 'mike.igc' }).pilot).toBe('mike');
  });
});
