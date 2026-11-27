import type { BadgeDef, BadgeFlight, BadgePlugin } from '../badgeKind';

const KM = 1000;
const H = 3600;

const max = (list: BadgeFlight[], f: (x: BadgeFlight) => number | undefined) =>
  list.reduce((m, x) => Math.max(m, f(x) ?? 0), 0);
const count = (list: BadgeFlight[], f: (x: BadgeFlight) => boolean) => list.filter(f).length;
const distinct = (list: BadgeFlight[], f: (x: BadgeFlight) => string | null | undefined) =>
  new Set(list.map((x) => f(x)?.trim().toLowerCase()).filter(Boolean)).size;
const isTriangle = (x: BadgeFlight) => x.xc?.kind === 'flat' || x.xc?.kind === 'fai';

const def = (
  id: string,
  label: string,
  unit: BadgeDef['unit'],
  thresholds: number[],
  value: BadgeDef['value'],
  scale = 1
): BadgeDef => ({ id, label, unit, thresholds: thresholds.map((t) => t * scale), value });

const gain = [300, 600, 1000, 1500, 2000, 2500, 3000, 4000];

export default {
  id: 'updraft/badges',
  name: 'Badges',
  kind: 'badge',
  apiVersion: 1,
  badges: [
    def(
      'free-distance',
      'Free distance',
      'distance',
      [5, 15, 30, 50, 100, 150, 250, 400],
      (l) => max(l, (x) => x.freeDistance),
      KM
    ),
    def('xc-speed', 'XC speed', 'speed', [10, 15, 20, 25, 30, 35, 40, 45], (l) => max(l, (x) => x.xc?.speed), 1 / 3.6),
    def(
      'longest-flight',
      'Longest flight',
      'duration',
      [0.5, 1, 2, 3, 4, 5, 7, 9],
      (l) => max(l, (x) => x.durationS),
      H
    ),
    def(
      'total-airtime',
      'Total airtime',
      'duration',
      [10, 25, 50, 100, 250, 500, 1000, 2000],
      (l) => l.reduce((s, x) => s + x.durationS, 0),
      H
    ),
    def('flights', 'Flights', 'count', [10, 25, 50, 100, 250, 500, 1000, 2000], (l) => l.length),
    def('max-altitude', 'Max altitude', 'altitude', [1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000], (l) =>
      max(l, (x) => x.maxAltMsl)
    ),
    def('max-gain', 'Max gain', 'altitude', gain, (l) => max(l, (x) => x.maxGain)),
    def('max-agl', 'Max height above ground', 'altitude', gain, (l) => max(l, (x) => x.maxAgl)),
    def('best-climb', 'Best climb', 'vario', [1, 1.5, 2, 2.5, 3, 4, 5, 6], (l) => max(l, (x) => x.bestClimb)),
    def('best-thermal-gain', 'Best thermal gain', 'altitude', [200, 400, 700, 1000, 1500, 2000, 2500, 3000], (l) =>
      max(l, (x) => x.bestThermalGain)
    ),
    def('sites', 'Sites', 'count', [1, 3, 5, 10, 20, 35, 50, 100], (l) => distinct(l, (x) => x.site)),
    def(
      'biggest-triangle',
      'Biggest triangle',
      'distance',
      [5, 10, 25, 50, 100, 150, 200, 300],
      (l) => max(l.filter(isTriangle), (x) => x.xc?.distance),
      KM
    ),
    def('triangles', 'Triangles', 'count', [1, 3, 5, 10, 25, 50, 100, 200], (l) => count(l, isTriangle)),
    def(
      'flight-days',
      'Flight days',
      'count',
      [5, 10, 25, 50, 100, 200, 400, 800],
      (l) => new Set(l.map((x) => x.date)).size
    ),
    def('gliders', 'Gliders', 'count', [1, 2, 3, 4, 6, 8, 12, 20], (l) => distinct(l, (x) => x.glider))
  ]
} satisfies BadgePlugin;
