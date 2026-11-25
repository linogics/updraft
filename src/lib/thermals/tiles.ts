// kk7 raster tiles in TMS order (y flipped). MapLibre uses scheme 'tms', Cesium uses {reverseY} for y.
// kk7 answers 403 unless the src query param matches the Referer host (and 127.0.0.1 is always rejected).
export const THERMAL_ATTRIBUTION = 'Thermals: thermal.kk7.ch';

const src = encodeURIComponent(typeof location === 'undefined' ? '' : location.hostname);

export const THERMAL_TILES = {
  hotspots: `https://thermal.kk7.ch/tiles/thermals_all_all/{z}/{x}/{y}.png?src=${src}`,
  skyways: `https://thermal.kk7.ch/tiles/skyways_all/{z}/{x}/{y}.png?src=${src}`
} as const;

export const THERMAL_MAX_ZOOM = 12;
