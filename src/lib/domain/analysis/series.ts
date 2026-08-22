import { bearing, distance } from '../geo';
import type { Fix } from '../model';

/** Half-width of the centred altitude smoothing window, seconds. */
const ALT_SMOOTH_HALF_WINDOW = 2;
/** Half-width of the centred vario / speed window, seconds. */
const RATE_HALF_WINDOW = 4;

export interface Series {
  vario: number[];
  speed: number[];
  heading: number[];
}

/** Index range [lo, hi] of fixes within ±halfWindow seconds of fix i. */
function windowAround(fixes: Fix[], i: number, halfWindow: number): [number, number] {
  const ms = halfWindow * 1000;
  let lo = i;
  while (lo > 0 && fixes[i].t - fixes[lo - 1].t <= ms) lo--;
  let hi = i;
  while (hi < fixes.length - 1 && fixes[hi + 1].t - fixes[i].t <= ms) hi++;
  return [lo, hi];
}

function smoothAltitudes(fixes: Fix[]): number[] {
  return fixes.map((_, i) => {
    // Shrink to a symmetric window near the track ends so trends are not biased.
    const [wlo, whi] = windowAround(fixes, i, ALT_SMOOTH_HALF_WINDOW);
    const half = Math.min(i - wlo, whi - i);
    const [lo, hi] = [i - half, i + half];
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += fixes[j].alt;
    return sum / (hi - lo + 1);
  });
}

/** Per-fix vario (m/s), ground speed (m/s) and heading (deg), aligned with fixes. */
export function computeSeries(fixes: Fix[]): Series {
  const n = fixes.length;
  const alt = smoothAltitudes(fixes);
  const vario = new Array<number>(n).fill(0);
  const speed = new Array<number>(n).fill(0);
  const heading = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    let [lo, hi] = windowAround(fixes, i, RATE_HALF_WINDOW);
    if (lo === hi) [lo, hi] = [Math.max(0, i - 1), Math.min(n - 1, i + 1)];
    if (lo === hi) continue;

    const dt = (fixes[hi].t - fixes[lo].t) / 1000;
    if (dt <= 0) continue;
    vario[i] = (alt[hi] - alt[lo]) / dt;

    let path = 0;
    for (let j = lo; j < hi; j++) path += distance(fixes[j], fixes[j + 1]);
    speed[i] = path / dt;
  }

  // Heading from immediate neighbours keeps turns sharp; carry it over while stationary.
  for (let i = 0; i < n; i++) {
    const a = fixes[Math.max(0, i - 1)];
    const b = fixes[Math.min(n - 1, i + 1)];
    heading[i] = distance(a, b) > 0.5 ? bearing(a, b) : i > 0 ? heading[i - 1] : 0;
  }
  return { vario, speed, heading };
}
