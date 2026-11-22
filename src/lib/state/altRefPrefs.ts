export type AltRef = 'msl' | 'agl';

/** Anything but 'agl' falls back to height above sea level. */
export function parseAltRef(raw: unknown): AltRef {
  return raw === 'agl' ? 'agl' : 'msl';
}
