import type { Fix, Flight } from '../model';

export const baseName = (name: string) => name.replace(/\.[^.]*$/, '');

/**
 * Builds a Flight from raw fixes. Throws when no usable fix exists. A missing altitude (NaN) takes the
 * last known one, so a gap does not drop the track to sea level.
 */
export function toFlight(sourceName: string, fixes: Fix[]): Flight {
  const valid = fixes.filter((f) => [f.t, f.lat, f.lon].every(Number.isFinite));
  if (valid.length === 0) throw new Error(`${sourceName}: no usable fixes found`);
  valid.sort((a, b) => a.t - b.t);
  let alt = valid.find((f) => Number.isFinite(f.alt))?.alt ?? 0;
  for (const f of valid) {
    if (Number.isFinite(f.alt)) alt = f.alt;
    else f.alt = alt;
  }
  return {
    id: crypto.randomUUID(),
    sourceName,
    pilot: baseName(sourceName),
    glider: null,
    site: null,
    date: new Date(valid[0].t).toISOString().slice(0, 10),
    fixes: valid
  };
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const xmlUnescape = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Inner text of every `<tag>` element, in document order. Regex instead of DOMParser so it also runs under node. */
export function xmlTexts(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  return [...xml.matchAll(re)].map((m) => xmlUnescape(m[1].trim()));
}
