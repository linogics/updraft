import { m } from '../paraglide/messages';

interface Logged {
  id?: string;
  date: string;
  startTime: number;
  endTime: number;
  site?: string | null;
  glider?: string | null;
  maxAlt?: number;
}

/** Number of flights and airtime in seconds. */
export function totals(flights: Logged[]): { flights: number; seconds: number } {
  const seconds = flights.reduce((sum, f) => sum + (f.endTime - f.startTime) / 1000, 0);
  return { flights: flights.length, seconds };
}

/** Airtime in hours per calendar month (YYYY-MM), the last `months` months up to `now`, oldest first. */
export function monthlyHours(flights: Logged[], months: number, now: Date): { month: string; hours: number }[] {
  const out = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return { month: d.toISOString().slice(0, 7), hours: 0 };
  });
  const index = new Map(out.map((m, i) => [m.month, i]));
  for (const f of flights) {
    const i = index.get(f.date.slice(0, 7));
    if (i !== undefined) out[i].hours += (f.endTime - f.startTime) / 3_600_000;
  }

  return out;
}

/** Sum of the known XC points, keyed by flight id. Flights without an entry count as zero. */
export function totalXcPoints(flights: Logged[], points: Record<string, number>): number {
  return flights.reduce((sum, f) => sum + (f.id ? (points[f.id] ?? 0) : 0), 0);
}

export interface BreakdownRow {
  label: string;
  flights: number;
  hours: number;
  points: number;
  maxAlt?: number;
  longestMin: number;
}

/** Flights grouped by year, site or glider. Years sort newest first, the rest by hours. */
export function breakdown(
  flights: Logged[],
  key: 'year' | 'site' | 'glider',
  points: Record<string, number> = {}
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const f of flights) {
    const label = key === 'year' ? f.date.slice(0, 4) : (f[key] ?? '') || m.common_unknown();
    const row = rows.get(label) ?? { label, flights: 0, hours: 0, points: 0, longestMin: 0 };
    const min = (f.endTime - f.startTime) / 60_000;
    row.flights++;
    row.hours += min / 60;
    row.points += f.id ? (points[f.id] ?? 0) : 0;
    row.longestMin = Math.max(row.longestMin, min);
    if (f.maxAlt !== undefined) row.maxAlt = Math.max(row.maxAlt ?? -Infinity, f.maxAlt);
    rows.set(label, row);
  }

  const out = [...rows.values()];
  return key === 'year' ? out.sort((a, b) => b.label.localeCompare(a.label)) : out.sort((a, b) => b.hours - a.hours);
}

/** Airtime in hours per year, oldest first, without gaps between the first and last year. */
export function yearlyHours(flights: Logged[]): { year: string; hours: number }[] {
  if (!flights.length) return [];
  const byYear = new Map(breakdown(flights, 'year').map((r) => [Number(r.label), r.hours]));
  const years = [...byYear.keys()];
  const first = Math.min(...years);
  return Array.from({ length: Math.max(...years) - first + 1 }, (_, i) => ({
    year: String(first + i),
    hours: byYear.get(first + i) ?? 0
  }));
}
