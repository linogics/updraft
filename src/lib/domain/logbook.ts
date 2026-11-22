interface Logged {
  date: string;
  startTime: number;
  endTime: number;
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
