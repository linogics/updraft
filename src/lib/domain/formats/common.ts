import { m } from '../../paraglide/messages';
import type { Fix, Flight } from '../model';

/** YYYY-MM-DD in the browser's time zone, so a flight after local midnight keeps its local date. */
export const localDate = (t: number) =>
  new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export const baseName = (name: string) => name.replace(/\.[^.]*$/, '');

/**
 * Builds a Flight from raw fixes. Throws when no usable fix exists. A missing altitude (NaN) takes the
 * last known one, so a gap does not drop the track to sea level.
 */
export function toFlight(sourceName: string, fixes: Fix[]): Flight {
  const valid = fixes.filter((f) => [f.t, f.lat, f.lon].every(Number.isFinite));
  if (valid.length === 0) throw new Error(m.format_no_usable({ name: sourceName }));
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
    date: localDate(valid[0].t),
    fixes: valid
  };
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const xmlUnescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const cdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => xmlEscape(t));

// matchAll clones the regex, so sharing the global one keeps lastIndex untouched.
const tagRegexes = new Map<string, RegExp>();

/**
 * Inner text of every `<tag>` element, in document order. Any namespace prefix (also on `tag`) is ignored
 * and CDATA is unwrapped. Regex instead of DOMParser so it also runs under node.
 */
export function xmlTexts(xml: string, tag: string): string[] {
  let re = tagRegexes.get(tag);
  if (!re) {
    const name = `(?:[\\w.-]+:)?${tag.replace(/^.*:/, '')}`;
    re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g');
    tagRegexes.set(tag, re);
  }

  return [...xml.matchAll(re)].map((m) => xmlUnescape(cdata(m[1]).trim()));
}
