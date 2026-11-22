import * as Cesium from 'cesium';
import type { AirspaceFeature } from '#lib/airspace/tiles';
import { classOf, CLASS_COLORS, isVisible, volumeHeights } from '#lib/airspace/model';
import type { AirspacePrefsValue } from '#lib/airspace/prefs';

const SKIPPED_TYPES = ['fir', 'uir'];
const ring = (r: number[][]) => Cesium.Cartesian3.fromDegreesArray(r.flatMap((c) => [c[0], c[1]]));

/** Airspaces as translucent extruded volumes in one primitive. Not pickable, so the pilot and camera are unaffected. */
export class AirspaceLayer {
  private primitive?: Cesium.Primitive;

  constructor(private viewer: Cesium.Viewer) {}

  set(features: AirspaceFeature[], prefs: AirspacePrefsValue, exaggeration: number) {
    this.clear();
    const instances: Cesium.GeometryInstance[] = [];
    for (const f of features) {
      const p = f.properties;
      if (SKIPPED_TYPES.includes(String(p.type).toLowerCase()) || !isVisible(p, prefs)) continue;
      const { floor, ceiling } = volumeHeights(p, exaggeration);
      if (ceiling <= floor) continue;
      const color = Cesium.Color.fromCssColorString(CLASS_COLORS[classOf(p.icao_class)]).withAlpha(prefs.opacity * 0.6);
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const [outer, ...holes] of polys) {
        instances.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: new Cesium.PolygonHierarchy(
                ring(outer),
                holes.map((h) => new Cesium.PolygonHierarchy(ring(h)))
              ),
              height: floor,
              extrudedHeight: ceiling,
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) }
          })
        );
      }
    }
    if (instances.length) {
      this.primitive = this.viewer.scene.primitives.add(
        new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
          allowPicking: false
        })
      );
    }
    this.viewer.scene.requestRender();
  }

  private clear() {
    if (this.primitive && !this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.primitive);
    this.primitive = undefined;
  }

  destroy() {
    this.clear();
  }
}
