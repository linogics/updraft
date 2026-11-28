import type { LatLon } from '../domain/geo';
import { resampleTerrarium } from '../domain/terrarium';
import { TERRARIUM_URL } from './basemaps';

/** Zoom of the ground lookup: 256 px tiles of ~10 m in the Alps. Same level as takeoff alignment. */
const GROUND_ZOOM = 13;
const TILE = 256;

/** Tile and pixel (within the tile) under a lat/lon, Web Mercator. */
export function locate(lat: number, lon: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: (fx - x) * TILE, py: (fy - y) * TILE };
}

// shortcut: samples stay inside one tile, so edge pixels clamp (about 1 px error at tile seams), upgrade if seams show.
/** Bilinear sample of a row-major size x size heightmap at pixel (x, y), x and y in [0, size). */
export function sampleBilinear(map: Float32Array, size: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = map[y0 * size + x0] * (1 - fx) + map[y0 * size + x1] * fx;
  const bottom = map[y1 * size + x0] * (1 - fx) + map[y1 * size + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

async function fetchTile(x: number, y: number, z: number): Promise<Float32Array> {
  const url = TERRARIUM_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Terrarium tile ${z}/${x}/${y}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return resampleTerrarium(data, canvas.width, TILE);
}

/**
 * Ground height in metres MSL under each fix, same order as the input. Rejects when tiles cannot load.
 * Tiles are not kept after the call (256 KB each), the browser HTTP cache covers repeat loads.
 */
export async function groundSeries(fixes: LatLon[], zoom = GROUND_ZOOM): Promise<Float32Array> {
  const at = fixes.map((f) => locate(f.lat, f.lon, zoom));
  const unique = new Map(at.map((p) => [`${p.x}/${p.y}`, p]));
  const loaded = new Map(
    await Promise.all([...unique].map(async ([key, p]) => [key, await fetchTile(p.x, p.y, zoom)] as const))
  );
  return Float32Array.from(at, (p) => sampleBilinear(loaded.get(`${p.x}/${p.y}`)!, TILE, p.px, p.py));
}
