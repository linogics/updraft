/** Lowercase ASCII words joined by dashes, safe in file names. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'flight';
}

function baseName(pilot: string, date: string, width: number, height: number): string {
  return `updraft-${slugify(pilot)}-${date}-${width}x${height}`;
}

export function pngFilename(pilot: string, date: string, width: number, height: number): string {
  return `${baseName(pilot, date, width, height)}.png`;
}

export function mp4Filename(pilot: string, date: string, width: number, height: number): string {
  return `${baseName(pilot, date, width, height)}.mp4`;
}
