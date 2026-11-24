import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { AirspaceProps } from './model';

export type AirspaceFeature = Feature<Polygon | MultiPolygon, AirspaceProps>;

export const TILE_URL = 'https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.pbf';

/** Decodes the `airspaces` layer of one tile to GeoJSON in lon/lat. */
export function decodeTile(buf: ArrayBuffer, x: number, y: number, z: number): AirspaceFeature[] {
  const layer = new VectorTile(new PbfReader(buf)).layers.airspaces;
  if (!layer) return [];
  const out: AirspaceFeature[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type === 3) out.push(f.toGeoJSON(x, y, z) as AirspaceFeature);
  }

  return out;
}

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/**
 * Airspaces of the tiles covering bbox [west, south, east, north].
 * shortcut: polygons stay clipped at tile edges and are not merged per source_id, merge when 3D needs whole shapes.
 */
export async function loadAirspaces(
  bbox: [number, number, number, number],
  key: string,
  zoom = 9
): Promise<AirspaceFeature[]> {
  const [w, s, e, n] = bbox;
  const jobs: Promise<AirspaceFeature[]>[] = [];
  for (let x = tileX(w, zoom); x <= tileX(e, zoom); x++) {
    for (let y = tileY(n, zoom); y <= tileY(s, zoom); y++) {
      jobs.push(
        fetch(
          `${TILE_URL.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y))}?apiKey=${encodeURIComponent(key)}`
        ).then(async (r) => {
          if (r.status === 404 || r.status === 204) return [];
          if (!r.ok) throw new Error(`openAIP tile ${zoom}/${x}/${y}: HTTP ${r.status}`);
          return decodeTile(await r.arrayBuffer(), x, y, zoom);
        })
      );
    }
  }

  return (await Promise.all(jobs)).flat();
}
