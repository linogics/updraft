export const XC_LEAGUES = [
  { id: 'XContest', label: 'XContest' },
  { id: 'FFVL', label: 'FFVL' },
  { id: 'FAI', label: 'FAI' },
  { id: 'FAI-Cylinders', label: 'FAI (cylinders)' },
  { id: 'FAI-OAR', label: 'FAI out-and-return' },
  { id: 'FAI-OAR2', label: 'FAI out-and-return, 2 turnpoints' },
  { id: 'XCLeague', label: 'UK XC League' }
] as const;

export type XcLeague = (typeof XC_LEAGUES)[number]['id'];

/** Validates the stored league. Anything unknown falls back to XContest. */
export function parseXcLeague(raw: unknown): XcLeague {
  return XC_LEAGUES.find((l) => l.id === raw)?.id ?? 'XContest';
}
