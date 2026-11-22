export const XC_LEAGUES = [
  { id: 'XContest', label: 'XContest' },
  { id: 'FFVL', label: 'FFVL' },
  { id: 'FAI', label: 'FAI' },
  { id: 'XCLeague', label: 'UK XC League' }
] as const;

export type XcLeague = (typeof XC_LEAGUES)[number]['id'];

/** Validates the stored league. Anything unknown falls back to XContest. */
export function parseXcLeague(raw: unknown): XcLeague {
  return XC_LEAGUES.find((l) => l.id === raw)?.id ?? 'XContest';
}
