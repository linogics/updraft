import type { ColorMode } from '#lib/domain/scene';
import type { LoadedFlight } from '#lib/state/studio.svelte';
import { phaseColor, varioColor } from './colors';

/** A stretch of track in one colour, inclusive fix range (runs share their joint fix). */
export interface ColorRun {
  color: string;
  start: number;
  end: number;
}

/** Splits a track into runs; segment i (fix i to i + 1) takes the colour of fix i. */
export function colorRuns(n: number, colorAt: (i: number) => string): ColorRun[] {
  const runs: ColorRun[] = [];
  for (let i = 0; i < n - 1; i++) {
    const color = colorAt(i);
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.end = i + 1;
    else runs.push({ color, start: i, end: i + 1 });
  }
  return runs;
}

/**
 * Per-fix CSS colour of a track in the given mode. `coarse` buckets vario to 0.5 m/s, so
 * runs stay long enough for the 2D map.
 */
export function trackColorAt(
  lf: Pick<LoadedFlight, 'analysis' | 'climbs' | 'color'>,
  colorBy: ColorMode,
  coarse = false
): (i: number) => string {
  const { analysis, climbs, color } = lf;
  switch (colorBy) {
    case 'vario':
      return coarse ? (i) => varioColor(Math.round(analysis.vario[i] * 2) / 2) : (i) => varioColor(analysis.vario[i]);
    case 'phase': {
      const kinds = new Array<string>(analysis.vario.length);
      for (const p of analysis.phases) kinds.fill(phaseColor(p.kind), p.start, p.end + 1);
      return (i) => kinds[i];
    }
    case 'climb':
      return (i) => phaseColor(climbs.kinds[i]);
    case 'pilot':
      return () => color;
  }
}
