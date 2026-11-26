import type { Fix, Flight } from '#lib/domain/model';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nameOrNull = (v: unknown) => v === null || typeof v === 'string';

/**
 * Turns what a converter returned into a Flight. Plugins are untrusted, so every field is checked and
 * copied into fresh objects. The app assigns `id` and `sourceName`. Throws an Error with a message for the user.
 */
export function toFlightChecked(raw: unknown, sourceName: string): Flight {
  const bad = (why: string) => new Error(`The converter returned an invalid track: ${why}.`);
  if (!raw || typeof raw !== 'object') throw bad('not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r.pilot !== 'string') throw bad('"pilot" must be a string');
  if (!nameOrNull(r.glider)) throw bad('"glider" must be a string or null');
  if (!nameOrNull(r.site)) throw bad('"site" must be a string or null');

  if (typeof r.date !== 'string' || !DATE.test(r.date) || Number.isNaN(Date.parse(r.date))) {
    throw bad('"date" must be YYYY-MM-DD');
  }

  if (!Array.isArray(r.fixes) || !r.fixes.length) throw bad('"fixes" must be a non-empty list');
  const fixes: Fix[] = [];
  for (const f of r.fixes as Record<string, unknown>[]) {
    const { t, lat, lon, alt } = (f ?? {}) as Record<string, number>;
    if (![t, lat, lon, alt].every(Number.isFinite)) throw bad(`fix ${fixes.length} has a non-finite number`);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw bad(`fix ${fixes.length} is outside the globe`);
    if (fixes.length && t < fixes[fixes.length - 1].t) throw bad(`fix ${fixes.length} is earlier than the one before`);
    fixes.push({ t, lat, lon, alt });
  }

  return {
    id: crypto.randomUUID(),
    sourceName,
    pilot: r.pilot,
    glider: r.glider,
    site: r.site,
    date: r.date,
    fixes
  };
}
