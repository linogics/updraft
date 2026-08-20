// Test-only helper: builds IGC text from simple fix descriptions.

export interface FixSpec {
  /** Seconds since 00:00:00 UTC. */
  sec: number;
  lat: number;
  lon: number;
  gpsAlt: number;
  pressureAlt?: number;
  valid?: boolean;
}

export interface HeaderSpec {
  date?: string; // DDMMYY
  pilot?: string;
  glider?: string;
  site?: string;
}

function pad(n: number, width: number): string {
  return String(Math.round(n)).padStart(width, '0');
}

function coord(value: number, degWidth: number, pos: string, neg: string): string {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const milliMinutes = Math.round((abs - deg) * 60000);
  return pad(deg, degWidth) + pad(milliMinutes, 5) + (value >= 0 ? pos : neg);
}

function time(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400;
  return pad(Math.floor(s / 3600), 2) + pad(Math.floor((s % 3600) / 60), 2) + pad(s % 60, 2);
}

export function bRecord(f: FixSpec): string {
  return (
    'B' +
    time(f.sec) +
    coord(f.lat, 2, 'N', 'S') +
    coord(f.lon, 3, 'E', 'W') +
    (f.valid === false ? 'V' : 'A') +
    pad(f.pressureAlt ?? f.gpsAlt, 5) +
    pad(f.gpsAlt, 5)
  );
}

export function buildIgc(fixes: FixSpec[], header: HeaderSpec = {}): string {
  const lines = [
    'AXCT0123456789',
    `HFDTEDATE:${header.date ?? '150726'},01`,
    `HFPLTPILOTINCHARGE:${header.pilot ?? 'Test Pilot'}`,
    `HFGTYGLIDERTYPE:${header.glider ?? 'Test Glider'}`
  ];
  if (header.site) lines.push(`HFSITSITE:${header.site}`);
  return [...lines, ...fixes.map(bRecord)].join('\r\n') + '\r\n';
}
