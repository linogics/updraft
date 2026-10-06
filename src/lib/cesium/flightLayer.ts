import * as Cesium from 'cesium';
import { indexAt, positionAt } from '#lib/domain/timeline';
import type { ColorMode } from '#lib/domain/scene';
import type { LoadedFlight } from '#lib/state/replay.svelte';
import { phaseColor, varioColor } from '#lib/ui/colors';
import { formatAlt, formatVario, type Units } from '#lib/ui/units';

/** Length of the bright trail behind the pilot, ms. */
const TAIL_MS = 60_000;

/** One flight in the 3D scene: coloured track, live pilot marker with trail, thermal markers. */
export class FlightLayer {
  private track: Cesium.Primitive | undefined;
  /** Inputs the current track primitive was built from; time shifts do not change it. */
  private trackKey = '';
  private pilot: Cesium.Entity;
  private tail: Cesium.Entity;
  private thermals: Cesium.Entity[] = [];
  private scratch = new Cesium.Cartesian3();

  constructor(
    private viewer: Cesium.Viewer,
    private loaded: LoadedFlight,
    private getTime: () => number
  ) {
    const color = Cesium.Color.fromCssColorString(loaded.color);

    this.pilot = viewer.entities.add({
      position: new Cesium.CallbackPositionProperty(
        (_t, result) => this.cartesianAt(this.getTime(), result ?? new Cesium.Cartesian3()),
        false
      ),
      point: {
        pixelSize: 12,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: loaded.flight.pilot,
        font: '13px sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: color.withAlpha(0.7),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1_000, 1, 50_000, 0.6)
      }
    });

    this.tail = viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const t = this.getTime();
          // Read fixes on each call: update() swaps in time-shifted flights.
          const { fixes } = this.loaded.flight;
          const from = indexAt(fixes, t - TAIL_MS);
          const to = indexAt(fixes, t);
          const pts: Cesium.Cartesian3[] = [];
          for (let i = from; i <= to; i++) pts.push(this.cartesian(fixes[i].lon, fixes[i].lat, fixes[i].alt));
          pts.push(this.cartesianAt(t, new Cesium.Cartesian3()));
          return pts;
        }, false),
        width: 6,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({ color, glowPower: 0.25 })
      }
    });
  }

  private cartesian(lon: number, lat: number, alt: number, result?: Cesium.Cartesian3): Cesium.Cartesian3 {
    return Cesium.Cartesian3.fromDegrees(lon, lat, alt + this.loaded.altOffset, undefined, result);
  }

  /** Interpolated pilot position at time t. Reuses an internal scratch unless result is given. */
  cartesianAt(t: number, result: Cesium.Cartesian3 = this.scratch): Cesium.Cartesian3 {
    const p = positionAt(this.loaded.flight.fixes, t);
    return this.cartesian(p.lon, p.lat, p.alt, result);
  }

  /** Track heading at time t, degrees. */
  headingAt(t: number): number {
    return this.loaded.analysis.heading[indexAt(this.loaded.flight.fixes, t)];
  }

  /** Rebuilds the static track polyline, e.g. after colour mode or altitude offset changes. */
  renderTrack(colorBy: ColorMode) {
    const key = `${colorBy}|${this.loaded.altOffset}`;
    if (this.track && key === this.trackKey) return;
    this.trackKey = key;
    if (this.track) this.viewer.scene.primitives.remove(this.track);
    const { flight, analysis, color } = this.loaded;

    const positions = flight.fixes.map((f) => this.cartesian(f.lon, f.lat, f.alt, new Cesium.Cartesian3()));
    const phaseAt = new Array<string>(flight.fixes.length);
    for (const p of analysis.phases) for (let i = p.start; i <= p.end; i++) phaseAt[i] = phaseColor(p.kind);
    const css = (i: number) =>
      colorBy === 'vario' ? varioColor(analysis.vario[i]) : colorBy === 'phase' ? phaseAt[i] : color;
    const colors = flight.fixes.map((_, i) => Cesium.Color.fromCssColorString(css(i)).withAlpha(0.9));

    const track: Cesium.Primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions,
          colors,
          colorsPerVertex: true,
          width: 3,
          arcType: Cesium.ArcType.NONE,
          vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT
        })
      }),
      appearance: new Cesium.PolylineColorAppearance({ translucent: false }),
      asynchronous: false
    });
    track.show = this.loaded.visible;
    this.track = this.viewer.scene.primitives.add(track);
  }

  /** Thermal columns with climb labels; shown for the selected pilot only to limit clutter. */
  renderThermals(show: boolean, units: Units) {
    for (const e of this.thermals) this.viewer.entities.remove(e);
    this.thermals = [];
    if (!show) return;
    for (const th of this.loaded.analysis.thermals) {
      if (th.gain <= 0) continue;
      const mid = (th.entryAlt + th.exitAlt) / 2;
      // Hide the column while the pilot is circling in it, otherwise it blocks the chase camera.
      const outside = new Cesium.CallbackProperty(() => {
        const i = indexAt(this.loaded.flight.fixes, this.getTime());
        return i < th.start || i > th.end;
      }, false);
      this.thermals.push(
        this.viewer.entities.add({
          position: this.cartesian(th.centerLon, th.centerLat, mid, new Cesium.Cartesian3()),
          cylinder: {
            show: outside,
            length: th.gain,
            topRadius: 35,
            bottomRadius: 35,
            material: Cesium.Color.fromCssColorString('#d95926').withAlpha(0.15),
            outline: false
          },
          label: {
            text: `+${formatAlt(th.gain, units)} · ${formatVario(th.avgClimb, units)}`,
            font: '12px sans-serif',
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#d95926').withAlpha(0.8),
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 30_000)
          }
        })
      );
    }
  }

  /** Swaps in the latest state snapshot of this flight (state replaces objects on change). */
  update(loaded: LoadedFlight) {
    this.loaded = loaded;
    this.setVisible(loaded.visible);
  }

  setVisible(visible: boolean) {
    if (this.track) this.track.show = visible;
    this.pilot.show = visible;
    this.tail.show = visible;
  }

  /** Bounding sphere around the whole track, for the initial camera view. */
  boundingSphere(): Cesium.BoundingSphere {
    const { fixes } = this.loaded.flight;
    return Cesium.BoundingSphere.fromPoints(fixes.map((f) => this.cartesian(f.lon, f.lat, f.alt, new Cesium.Cartesian3())));
  }

  destroy() {
    if (this.track) this.viewer.scene.primitives.remove(this.track);
    this.viewer.entities.remove(this.pilot);
    this.viewer.entities.remove(this.tail);
    for (const e of this.thermals) this.viewer.entities.remove(e);
  }
}
