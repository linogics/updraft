import { m } from '../paraglide/messages';
import { getLocale } from '../paraglide/runtime';

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
  return min < 60 ? m.airtime_minutes({ min }) : m.airtime_hours({ h: Math.floor(min / 60), min: pad(min % 60) });
}

/** Clock time (HH:MM:SS, 24 h) of a Unix ms timestamp in the given or local time zone. */
export function formatClock(t: number, timeZone?: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone
  }).format(t);
}

/** Decimals in the current locale (decimal comma in de and fr), no grouping separators. */
export function formatNumber(v: number, digits = 0, minDigits = digits): string {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: digits,
    useGrouping: false
  }).format(v);
}

/** Calendar date (YYYY-MM-DD) as a short numeric date in the given or current locale, without time zone shift. */
export function formatDate(iso: string, locale: string = getLocale()): string {
  const [y, mo, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, mo - 1, d);
  // Intl throws on an invalid time, so a malformed date shows as stored.
  return Number.isFinite(t) ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC' }).format(t) : iso;
}
