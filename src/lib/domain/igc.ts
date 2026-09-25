import IGCParser from 'igc-parser';
import type { Fix, Flight } from './model';

export interface ParseOptions {
  id: string;
  sourceName: string;
}

/** Parses IGC text into a Flight. Throws if no valid fixes remain. */
export function parseIgc(text: string, { id, sourceName }: ParseOptions): Flight {
  const igc = IGCParser.parse(text, { lenient: true });

  // Prefer 3D (A) fixes; some loggers only ever write V, so fall back to those.
  const useInvalid = !igc.fixes.some((b) => b.valid);
  const fixes: Fix[] = [];
  for (const b of igc.fixes) {
    if (!b.valid && !useInvalid) continue;
    if (b.latitude === 0 && b.longitude === 0) continue;
    const alt = b.gpsAltitude || b.pressureAltitude;
    if (alt == null) continue;
    fixes.push({ t: b.timestamp, lat: b.latitude, lon: b.longitude, alt });
  }

  if (fixes.length === 0) {
    throw new Error(`${sourceName}: no valid fixes found`);
  }

  return {
    id,
    sourceName,
    pilot: igc.pilot?.trim() || sourceName.replace(/\.igc$/i, ''),
    glider: igc.gliderType?.trim() || null,
    site: igc.site?.trim() || null,
    date: igc.date,
    fixes
  };
}
