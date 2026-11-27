import type { ClubStats } from '../club/stats';

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || num(v);
const nullableStr = (v: unknown) => v === null || typeof v === 'string';

const isClubs = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((c) => typeof c === 'string'));

/** Shape and finite numbers of a shared summary. Anything from the server goes through here. */
export const isClubStats = (v: unknown): v is ClubStats => {
  if (!isObj(v) || v.v !== 1) return false;
  const { xc } = v;
  return (
    typeof v.pilot === 'string' &&
    typeof v.date === 'string' &&
    nullableStr(v.site) &&
    nullableStr(v.glider) &&
    [v.durationS, v.freeDistanceKm, v.maxAltMsl, v.maxGain, v.bestClimb, v.bestThermalGain].every(num) &&
    optNum(v.maxAgl) &&
    (xc === undefined ||
      (isObj(xc) &&
        typeof xc.league === 'string' &&
        typeof xc.kind === 'string' &&
        num(xc.points) &&
        num(xc.distanceKm) &&
        optNum(xc.speedKmh)))
  );
};

export const isFlight = (v: unknown) =>
  isObj(v) &&
  typeof v.id === 'string' &&
  typeof v.date === 'string' &&
  typeof v.pilot === 'string' &&
  Array.isArray(v.fixes) &&
  v.fixes.length > 0 &&
  isObj(v.fixes[0]) &&
  Number.isFinite(v.fixes[0].t) &&
  isClubs(v.clubs) &&
  (v.club === undefined || isClubStats(v.club));

/** The `data` of a synced flight, which is the summary without its id. Anything from the server goes through here. */
export const isFlightData = (v: unknown) =>
  isObj(v) &&
  typeof v.date === 'string' &&
  typeof v.pilot === 'string' &&
  typeof v.sourceName === 'string' &&
  typeof v.hasTrack === 'boolean' &&
  [v.fixCount, v.startTime, v.endTime].every(num) &&
  optNum(v.maxAlt) &&
  optNum(v.trackKm) &&
  isClubs(v.clubs) &&
  (v.club === undefined || isClubStats(v.club));

export const isCameraData = (v: unknown) => isObj(v) && isObj(v.tracks);

export const isManual = (v: unknown) =>
  isObj(v) && typeof v.id === 'string' && typeof v.date === 'string' && v.manual === true;

export const isCameraPath = (v: unknown) => isObj(v) && typeof v.key === 'string';
