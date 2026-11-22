import * as Cesium from 'cesium';
import type { LatLon } from '#lib/domain/geo';
import type { XcScore } from '#lib/xc/score';
import { ring } from '#lib/xc/ring';

const line = (pts: LatLon[]) => Cesium.Cartesian3.fromDegreesArray(pts.flatMap((p) => [p.lon, p.lat]));

/** The scored XC route of one pilot, draped on the terrain: white line on a dark casing. */
export class XcRoute {
  private entities: Cesium.Entity[] = [];

  constructor(private viewer: Cesium.Viewer) {}

  set(score: XcScore | null | undefined) {
    this.clear();
    if (!score) return;
    const paths = [score.turnpoints, ...(score.closing ? [ring(score.closing.center, score.closing.radius)] : [])];
    for (const [width, color] of [[7, Cesium.Color.fromCssColorString('#0b0c0f')], [3, Cesium.Color.WHITE]] as const) {
      for (const pts of paths) {
        this.entities.push(
          this.viewer.entities.add({ polyline: { positions: line(pts), width, material: color, clampToGround: true } })
        );
      }
    }
    for (const p of score.turnpoints) {
      this.entities.push(
        this.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
          point: {
            pixelSize: 8,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#0b0c0f'),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      );
    }
    this.viewer.scene.requestRender();
  }

  private clear() {
    for (const e of this.entities) this.viewer.entities.remove(e);
    this.entities = [];
  }

  destroy() {
    this.clear();
  }
}
