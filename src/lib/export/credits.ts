import { BASEMAPS, TERRARIUM_ATTRIBUTION } from '#lib/map/basemaps';
import type { BasemapId, TerrainSource } from '#lib/domain/scene';
import { THERMAL_ATTRIBUTION } from '#lib/thermals/tiles';

/** Map, terrain and thermal overlay attribution for an exported frame, one line. */
export function mapCredits(basemap: BasemapId, terrain: TerrainSource, thermal: boolean): string {
  const terrainCredit =
    terrain === 'terrarium' ? TERRARIUM_ATTRIBUTION : terrain === 'ion' ? 'Terrain: Cesium World Terrain, Cesium ion' : '';
  return [BASEMAPS[basemap].attribution, terrainCredit, thermal ? THERMAL_ATTRIBUTION : ''].filter(Boolean).join(' · ');
}
