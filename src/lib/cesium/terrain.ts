import * as Cesium from 'cesium';
import type { TerrainSource } from '#lib/domain/scene';
import { resampleTerrarium } from '#lib/domain/terrarium';
import { TERRARIUM_ATTRIBUTION, TERRARIUM_MAX_ZOOM, TERRARIUM_URL } from '#lib/map/basemaps';

/** Heightmap samples per tile edge (Cesium's usual 65 for heightmap terrain). */
const SAMPLES = 65;
/** Deepest level fetched; Cesium upsamples below it. */
const MAX_LEVEL = TERRARIUM_MAX_ZOOM - 1;
/** Level used for point height queries (takeoff alignment): ~10 m pixels in the Alps. */
export const SAMPLE_LEVEL = 13;

async function loadTile(x: number, y: number, level: number): Promise<Float32Array> {
  const url = TERRARIUM_URL.replace('{z}', String(level)).replace('{x}', String(x)).replace('{y}', String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Terrarium tile ${level}/${x}/${y}: HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return resampleTerrarium(data, canvas.width, SAMPLES);
}

/** Free, keyless terrain from AWS Terrain Tiles. Web Mercator tiles map 1:1 onto Cesium's tiling scheme. */
export function createTerrariumTerrainProvider(): Cesium.CustomHeightmapTerrainProvider {
  return new Cesium.CustomHeightmapTerrainProvider({
    width: SAMPLES,
    height: SAMPLES,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: TERRARIUM_ATTRIBUTION,
    callback: (x, y, level) => (level > MAX_LEVEL ? undefined : loadTile(x, y, level))
  });
}

/** Terrain provider for a source. ion needs Ion.defaultAccessToken to be set. */
export async function createTerrainProvider(source: TerrainSource): Promise<Cesium.TerrainProvider> {
  if (source === 'ion') return Cesium.createWorldTerrainAsync({ requestVertexNormals: true });
  if (source === 'terrarium') return createTerrariumTerrainProvider();
  return new Cesium.EllipsoidTerrainProvider();
}
