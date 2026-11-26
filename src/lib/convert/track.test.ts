import { describe, expect, it } from 'vitest';

import { toFlightChecked } from './track';

const ok = {
  pilot: 'Ann',
  glider: null,
  site: 'Fiesch',
  date: '2026-07-15',
  fixes: [
    { t: 1, lat: 47, lon: 11, alt: 1000 },
    { t: 2, lat: 47.1, lon: 11.1, alt: 1010 }
  ]
};

describe('toFlightChecked', () => {
  it('copies the track, drops extra fields and assigns id and sourceName', () => {
    const f = toFlightChecked(
      { ...ok, id: 'evil', sourceName: 'evil', extra: 1, fixes: [{ ...ok.fixes[0], x: 1 }] },
      'a.csv'
    );
    expect(f).toMatchObject({ sourceName: 'a.csv', pilot: 'Ann', date: '2026-07-15' });
    expect(f.id).not.toBe('evil');
    expect(f).not.toHaveProperty('extra');
    expect(f.fixes).toEqual([ok.fixes[0]]);
    expect(f.fixes[0]).not.toBe(ok.fixes[0]);
  });

  it.each([
    ['not an object', null],
    ['bad pilot', { ...ok, pilot: 1 }],
    ['bad glider', { ...ok, glider: 1 }],
    ['bad site', { ...ok, site: undefined }],
    ['bad date', { ...ok, date: '15.07.2026' }],
    ['impossible date', { ...ok, date: '2026-13-45' }],
    ['no fixes', { ...ok, fixes: [] }],
    ['fixes not a list', { ...ok, fixes: 'x' }],
    ['NaN fix', { ...ok, fixes: [{ ...ok.fixes[0], alt: NaN }] }],
    ['string fix', { ...ok, fixes: [{ ...ok.fixes[0], lat: '47' }] }],
    ['null fix', { ...ok, fixes: [null] }],
    ['lat out of range', { ...ok, fixes: [{ ...ok.fixes[0], lat: 91 }] }],
    ['lon out of range', { ...ok, fixes: [{ ...ok.fixes[0], lon: -181 }] }],
    ['time going back', { ...ok, fixes: [ok.fixes[1], ok.fixes[0]] }]
  ])('rejects %s', (_, raw) => {
    expect(() => toFlightChecked(raw, 'a.csv')).toThrow(/invalid track/);
  });
});
