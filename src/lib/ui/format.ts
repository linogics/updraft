const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds as h:mm:ss, or m:ss below one hour. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function formatVario(ms: number): string {
  const v = Math.round(ms * 10) / 10;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)} m/s`;
}

export function formatAlt(metres: number): string {
  return `${Math.round(metres)} m`;
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
