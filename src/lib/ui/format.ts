const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds as h:mm:ss, or m:ss below one hour. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Airtime as "3 h 12" or "35 min", so it reads as a duration and never as a clock. */
export function formatAirtime(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${pad(min % 60)}`;
}

/** Clock time (HH:MM:SS) of a Unix ms timestamp in the given or local time zone. */
export function formatClock(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone
  }).format(t);
}
