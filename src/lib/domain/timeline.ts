import type { Fix } from './model';

/** Index of the last fix at or before t (binary search), clamped to the track. */
export function indexAt(fixes: Fix[], t: number): number {
  if (t <= fixes[0].t) return 0;
  let lo = 0;
  let hi = fixes.length - 1;
  if (t >= fixes[hi].t) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fixes[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface Position {
  lat: number;
  lon: number;
  alt: number;
}

/** Linearly interpolated position at time t, clamped to the first / last fix. */
export function positionAt(fixes: Fix[], t: number): Position {
  const i = indexAt(fixes, t);
  const a = fixes[i];
  const b = fixes[Math.min(i + 1, fixes.length - 1)];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * k,
    lon: a.lon + (b.lon - a.lon) * k,
    alt: a.alt + (b.alt - a.alt) * k
  };
}

export interface ResampledAltitudes {
  /** Unix seconds. */
  x: number[];
  series: (number | null)[][];
}

/**
 * Samples every track's altitude on one shared time grid so several flights fit a
 * single chart. Values outside a flight's time range are null.
 */
export function resampleAltitudes(tracks: Fix[][], stepSeconds: number, maxSamples = 5000): ResampledAltitudes {
  const start = Math.min(...tracks.map((f) => f[0].t));
  const end = Math.max(...tracks.map((f) => f[f.length - 1].t));
  const step = Math.max(stepSeconds * 1000, (end - start) / maxSamples);

  const x: number[] = [];
  for (let t = start; t <= end + 1e-6; t += step) x.push(t / 1000);

  const series = tracks.map((fixes) => {
    const first = fixes[0].t;
    const last = fixes[fixes.length - 1].t;
    return x.map((s) => {
      const t = s * 1000;
      return t < first || t > last ? null : positionAt(fixes, t).alt;
    });
  });
  return { x, series };
}
