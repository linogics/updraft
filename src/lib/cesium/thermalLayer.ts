import * as Cesium from 'cesium';
import type { ThermalOverlayPrefsValue } from '#lib/thermals/prefs';
import { THERMAL_ATTRIBUTION, THERMAL_MAX_ZOOM, THERMAL_TILES } from '#lib/thermals/tiles';

/**
 * Hotspot and skyway tiles draped on the globe as translucent imagery. Added above the basemap
 * imagery, so setBasemap (which replaces index 0) leaves them alone. Tracks and airspaces are
 * primitives and draw above them.
 */
export class ThermalLayer {
  private layers = new Map<string, Cesium.ImageryLayer>();

  constructor(private viewer: Cesium.Viewer) {}

  set(p: ThermalOverlayPrefsValue) {
    for (const [kind, on] of [
      ['hotspots', p.hotspots],
      ['skyways', p.skyways]
    ] as const) {
      let layer = this.layers.get(kind);
      if (!on) {
        if (layer) this.remove(kind, layer);
        continue;
      }

      if (!layer) {
        // Cesium's TMS placeholder is {reverseY}.
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: THERMAL_TILES[kind].replace('{y}', '{reverseY}'),
          maximumLevel: THERMAL_MAX_ZOOM,
          credit: new Cesium.Credit(THERMAL_ATTRIBUTION)
        });
        layer = this.viewer.imageryLayers.addImageryProvider(provider);
        this.layers.set(kind, layer);
      }

      layer.alpha = p.opacity;
    }

    this.viewer.scene.requestRender();
  }

  private remove(kind: string, layer: Cesium.ImageryLayer) {
    if (!this.viewer.isDestroyed()) this.viewer.imageryLayers.remove(layer, true);
    this.layers.delete(kind);
  }

  destroy() {
    for (const [kind, layer] of [...this.layers]) this.remove(kind, layer);
  }
}
