import type { Fix, Phase, Thermal } from '../model';

/** One thermal per thermalling phase, with climb figures and the circling centre. */
export function extractThermals(fixes: Fix[], vario: number[], phases: Phase[]): Thermal[] {
  return phases
    .filter((p) => p.kind === 'thermalling')
    .map(({ start, end }) => {
      const entry = fixes[start];
      const exit = fixes[end];
      const duration = (exit.t - entry.t) / 1000;
      const gain = exit.alt - entry.alt;

      let lat = 0;
      let lon = 0;
      let maxClimb = -Infinity;
      for (let i = start; i <= end; i++) {
        lat += fixes[i].lat;
        lon += fixes[i].lon;
        maxClimb = Math.max(maxClimb, vario[i]);
      }
      const count = end - start + 1;

      return {
        start,
        end,
        duration,
        entryAlt: entry.alt,
        exitAlt: exit.alt,
        gain,
        avgClimb: duration > 0 ? gain / duration : 0,
        maxClimb,
        centerLat: lat / count,
        centerLon: lon / count
      };
    });
}
