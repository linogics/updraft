import { BASEMAPS, TERRARIUM_ATTRIBUTION } from '#lib/map/basemaps';
import type { BasemapId, TerrainSource } from '#lib/domain/scene';

/** Map and terrain attribution for an exported frame, one line. */
export function mapCredits(basemap: BasemapId, terrain: TerrainSource): string {
  const terrainCredit =
    terrain === 'terrarium' ? TERRARIUM_ATTRIBUTION : terrain === 'ion' ? 'Terrain: Cesium World Terrain, Cesium ion' : '';
  return [BASEMAPS[basemap].attribution, terrainCredit].filter(Boolean).join(' · ');
}
