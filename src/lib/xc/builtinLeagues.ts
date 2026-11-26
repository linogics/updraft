import type { LeagueRule } from '#lib/plugins/api';

/** A bundled league. Its id is the plain name stored since before leagues were plugins. */
export interface BuiltinLeague {
  id: string;
  label: string;
  rules: readonly LeagueRule[];
}

const FAI_CLOSING = { fixed: 0.8, free: 0.8 };
const CLOSED = { fixed: 0, free: 0, relative: 0.05 };
const FFVL_CLOSING = { fixed: 3, free: 3, relative: 0.05 };

/** The FAI free distance, free triangle and FAI triangle, rounded to 1 decimal. */
const fai = (cylinders?: number): LeagueRule[] =>
  [
    { name: 'Free Distance around 3 TPs', type: 'free', multiplier: 1 },
    { name: 'Free Triangle', type: 'flat', multiplier: 1.2, closing: FAI_CLOSING },
    { name: 'FAI Triangle', type: 'fai', multiplier: 1.4, closing: FAI_CLOSING }
  ].map((r) => ({ ...r, decimals: 1, ...(cylinders && { cylinders }) }) as LeagueRule);

/** The UK league scores each type in three distance classes. */
const xcLeague = (
  names: [string, string, string],
  mins: [number, number, number],
  mults: [number, number, number],
  rule: Partial<LeagueRule> & Pick<LeagueRule, 'type'>
): LeagueRule[] =>
  names.map((name, i) => ({
    name,
    multiplier: mults[i],
    minDistance: mins[i],
    closing: { fixed: 0.8 },
    decimals: 1,
    ...rule
  }));

/** Same data as the rule sets of igc-xc-score, a test keeps them equal. */
export const BUILTIN_LEAGUES: readonly BuiltinLeague[] = [
  {
    id: 'XContest',
    label: 'XContest',
    rules: [
      { name: 'Free Flight', type: 'free', multiplier: 1 },
      { name: 'Free Triangle', type: 'flat', multiplier: 1.2, closing: { relative: 0.2 } },
      { name: 'FAI Triangle', type: 'fai', multiplier: 1.4, closing: { relative: 0.2 } },
      { name: 'Closed Free Triangle', type: 'flat', multiplier: 1.4, closing: CLOSED },
      { name: 'Closed FAI Triangle', type: 'fai', multiplier: 1.6, closing: CLOSED }
    ]
  },
  {
    id: 'FFVL',
    label: 'FFVL',
    rules: [
      { name: 'Distance 3 points', type: 'free', multiplier: 1 },
      { name: 'Triangle plat', type: 'flat', multiplier: 1.2, closing: FFVL_CLOSING },
      { name: 'Triangle FAI', type: 'fai', multiplier: 1.4, closing: FFVL_CLOSING }
    ]
  },
  { id: 'FAI', label: 'FAI', rules: fai() },
  { id: 'FAI-Cylinders', label: 'FAI (cylinders)', rules: fai(0.4) },
  {
    id: 'FAI-OAR',
    label: 'FAI out-and-return',
    rules: [{ name: 'Out-and-Return Distance', type: 'oar', multiplier: 1, closing: FAI_CLOSING, decimals: 1 }]
  },
  {
    id: 'FAI-OAR2',
    label: 'FAI out-and-return, 2 turnpoints',
    rules: [
      { name: 'Out-and-Return Flight around 2 TPs', type: 'oar2', multiplier: 1, closing: FAI_CLOSING, decimals: 1 }
    ]
  },
  {
    id: 'XCLeague',
    label: 'UK XC League',
    rules: [
      ...xcLeague(
        ['Out-and-Return Distance >=35km', 'Out-and-Return Distance >=15km', 'Out-and-Return Distance >=5km (Clubs)'],
        [35, 15, 5],
        [2, 1.5, 1.2],
        { type: 'oar2' }
      ),
      { name: 'Turnpoint Flight', type: 'free', multiplier: 1, minDistance: 5, decimals: 1 },
      ...xcLeague(
        ['Flat Triangle >=35km', 'Flat Triangle >=15km', 'Flat Triangle >=5km (Clubs)'],
        [35, 15, 5],
        [2, 1.5, 1.2],
        { type: 'flat', minSide: 0.15, maxSide: 0.45 }
      ),
      // The library scores these as plain triangles with a 0.28 minimum side, so they stay flat here too.
      ...xcLeague(
        ['FAI Triangle >=25km', 'FAI Triangle >=15km', 'FAI Triangle >=5km (Clubs)'],
        [25, 15, 5],
        [2.3, 2, 1.5],
        { type: 'flat', minSide: 0.28 }
      )
    ]
  }
];
