import type * as maplibregl from 'maplibre-gl';
import { FILL as AIRSPACE_FILL } from '#lib/airspace/layers';
import type { ThermalOverlayDraw } from './prefs';
import { THERMAL_ATTRIBUTION, THERMAL_MAX_ZOOM, THERMAL_TILES } from './tiles';

const LAYERS = [
  { id: 'thermal-hotspots', url: THERMAL_TILES.hotspots, on: (p: ThermalOverlayDraw) => p.hotspots },
  { id: 'thermal-skyways', url: THERMAL_TILES.skyways, on: (p: ThermalOverlayDraw) => p.skyways }
] as const;

/**
 * Adds, updates or removes the thermal raster layers to match the prefs. Safe to call on every change.
 * `before` keeps the flight layers above the overlay. Airspaces stay above it too.
 */
export function syncThermals(map: maplibregl.Map, p: ThermalOverlayDraw, before: string) {
  // Airspaces may already be drawn, so insert under them to keep the order whatever the toggle order.
  const under = map.getLayer(AIRSPACE_FILL) ? AIRSPACE_FILL : before;
  for (const { id, url, on } of LAYERS) {
    if (!on(p)) {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      continue;
    }

    if (!map.getSource(id)) {
      // Source and layer share the id. The kk7 tiles are TMS, so the y axis is flipped.
      map.addSource(id, {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        scheme: 'tms',
        maxzoom: THERMAL_MAX_ZOOM,
        attribution: THERMAL_ATTRIBUTION
      });
      map.addLayer({ id, type: 'raster', source: id }, under);
    }

    map.setPaintProperty(id, 'raster-opacity', p.opacity);
  }
}
