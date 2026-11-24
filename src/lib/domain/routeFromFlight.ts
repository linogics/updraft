import type { Fix } from './model';
import { distance, type LatLon } from './geo';

const MAX_CANDIDATES = 400;

/** Start, `turnpoints` turnpoints and end in time order, maximising the summed leg distance. */
export function routeFromFlight(fixes: Fix[], turnpoints: number): LatLon[] {
  const k = Math.ceil(fixes.length / MAX_CANDIDATES) || 1;
  const cand = fixes.filter((_, i) => i % k === 0 || i === fixes.length - 1);
  const m = cand.length;
  const legs = turnpoints + 1;
  if (m < legs + 1) return cand.map(({ lat, lon }) => ({ lat, lon }));

  const d = new Float64Array(m * m);
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) d[a * m + b] = distance(cand[a], cand[b]);

  // best[j][i]: longest path of j legs ending at candidate i, from[j][i]: its previous candidate
  const best: Float64Array[] = [new Float64Array(m)];
  const from: Int32Array[] = [new Int32Array(m)];
  for (let j = 1; j <= legs; j++) {
    const cur = new Float64Array(m).fill(-Infinity);
    const prev = new Int32Array(m);
    for (let i = j; i < m; i++)
      for (let p = j - 1; p < i; p++) {
        const v = best[j - 1][p] + d[p * m + i];
        if (v > cur[i]) {
          cur[i] = v;
          prev[i] = p;
        }
      }

    best.push(cur);
    from.push(prev);
  }

  let i = 0;
  for (let c = 1; c < m; c++) if (best[legs][c] > best[legs][i]) i = c;
  const route: LatLon[] = [];
  for (let j = legs; j >= 0; j--) {
    route.unshift({ lat: cand[i].lat, lon: cand[i].lon });
    i = from[j][i];
  }

  return route;
}
