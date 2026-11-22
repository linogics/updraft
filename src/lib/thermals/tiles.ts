// kk7 raster tiles in TMS order (y flipped). MapLibre uses scheme 'tms', Cesium uses {reverseY} for y.
export const THERMAL_ATTRIBUTION = 'Thermals: thermal.kk7.ch';

export const THERMAL_TILES = {
  hotspots: 'https://thermal.kk7.ch/tiles/thermals_all_all/{z}/{x}/{y}.png',
  skyways: 'https://thermal.kk7.ch/tiles/skyways_all/{z}/{x}/{y}.png'
} as const;

export const THERMAL_MAX_ZOOM = 12;
