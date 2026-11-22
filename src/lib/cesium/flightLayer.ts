import * as Cesium from 'cesium';
import { smoothPath } from '#lib/domain/smooth';
import { indexAt, positionAt } from '#lib/domain/timeline';
import type { ColorMode, TrackStyle } from '#lib/domain/scene';
import type { LoadedFlight } from '#lib/state/replay.svelte';
import { varioColor } from '#lib/ui/colors';
import { colorRuns, trackColorAt } from '#lib/ui/trackColors';
import { formatAlt, formatVario, type Units } from '#lib/ui/units';

/** Black or white text, whichever reads better on the label background. */
function labelText(css: string): Cesium.Color {
  const c = Cesium.Color.fromCssColorString(css);
  return c.red * 0.299 + c.green * 0.587 + c.blue * 0.114 > 0.6 ? Cesium.Color.BLACK : Cesium.Color.WHITE;
}

/** Length of the bright trail behind the pilot, ms. */
const TAIL_MS = 60_000;
/** Spacing of curtain wall posts; denser adds vertices without visible gain. */
const CURTAIN_STEP_MS = 5_000;
/** Dark casing on each side of an outlined track, px. */
const OUTLINE_PX = 2;

/**
 * Per-vertex coloured polyline with a dark casing drawn in the fragment shader. A second, wider
 * line underneath z-fights with the track (same depth), so the casing is part of the same line:
 * the vertex shader passes the side (-1..1 across the line) and the outer band is painted dark.
 */
function outlinedAppearance(width: number): Cesium.PolylineColorAppearance {
  const base = new Cesium.PolylineColorAppearance({ translucent: false });
  const vs = base.vertexShaderSource
    .replace('out vec4 v_color;', 'out vec4 v_color;\nout float v_side;')
    .replace('v_color = color;', 'v_color = color;\n    v_side = expandAndWidth.x;');
  // Cesium changed its shader: draw the plain line rather than break the track.
  if (!vs.includes('v_side = expandAndWidth.x')) return base;
  const inner = (width / (width + OUTLINE_PX * 2)).toFixed(4);
  return new Cesium.PolylineColorAppearance({
    translucent: false,
    vertexShaderSource: vs,
    fragmentShaderSource: `
in vec4 v_color;
in float v_side;

void main()
{
    vec4 casing = vec4(0.043, 0.047, 0.059, 1.0);
    out_FragColor = czm_gammaCorrect(abs(v_side) > ${inner} ? casing : v_color);
}
`
  });
}

/** One flight in the 3D scene: coloured track, live pilot marker with trail, thermal markers. */
export class FlightLayer {
  /** Track primitives: optional curtain, then the line. */
  private track: Cesium.Primitive[] = [];
  private tailWidth = 6;
  /** Inputs the current track primitive was built from; time shifts do not change it. */
  private trackKey = '';
  /** Climbs the track was coloured from; the 'climb' mode rebuilds when the thermal filter changes. */
  private trackClimbs: LoadedFlight['climbs'] | undefined;
  private pilot: Cesium.Entity;
  private tail: Cesium.Entity;
  private thermals: Cesium.Entity[] = [];
  private scratch = new Cesium.Cartesian3();

  constructor(
    private viewer: Cesium.Viewer,
    private loaded: LoadedFlight,
    private getTime: () => number,
    /** Polylines and walls ignore scene.verticalExaggeration, so heights are scaled here to match the terrain. */
    private getExaggeration: () => number = () => 1
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
        width: new Cesium.CallbackProperty(() => this.tailWidth, false),
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({ color, glowPower: 0.25 })
      }
    });
  }

  private cartesian(lon: number, lat: number, alt: number, result?: Cesium.Cartesian3): Cesium.Cartesian3 {
    return Cesium.Cartesian3.fromDegrees(
      lon,
      lat,
      (alt + this.loaded.altOffset) * this.getExaggeration(),
      undefined,
      result
    );
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

  /** Rebuilds the static track, e.g. after colour mode, style, width or altitude offset changes. */
  renderTrack(colorBy: ColorMode, style: TrackStyle, width: number, smooth: boolean) {
    const key = `${colorBy}|${style}|${width}|${smooth}|${this.loaded.color}|${this.loaded.altOffset}|${this.getExaggeration()}`;
    const climbs = this.loaded.climbs;
    if (this.track.length && key === this.trackKey && (colorBy !== 'climb' || climbs === this.trackClimbs)) return;
    this.trackKey = key;
    this.trackClimbs = climbs;
    this.tailWidth = width * 2;
    for (const p of this.track) this.viewer.scene.primitives.remove(p);
    this.track = [];

    const { fixes } = this.loaded.flight;
    const path = smoothPath(fixes, smooth ? 3 : 0);
    const positions = path.points.map((f) => this.cartesian(f.lon, f.lat, f.alt, new Cesium.Cartesian3()));
    const pilot = Cesium.Color.fromCssColorString(this.loaded.color);
    const line = (geometry: Partial<ConstructorParameters<typeof Cesium.PolylineGeometry>[0]>, w: number) =>
      new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({ positions, width: w, arcType: Cesium.ArcType.NONE, ...geometry })
      });

    // The curtain walls keep the raw fixes, their sparse posts gain nothing from a spline.
    if (style === 'curtain') this.add(this.curtain(pilot));

    // Cesium glow is a single-colour material, so it only applies to the pilot colour mode.
    if (style === 'glow' && colorBy === 'pilot') {
      this.add(
        new Cesium.Primitive({
          geometryInstances: line({ vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT }, width * 3),
          appearance: new Cesium.PolylineMaterialAppearance({
            material: Cesium.Material.fromType('PolylineGlow', { color: pilot, glowPower: 0.2 })
          }),
          asynchronous: false
        })
      );
      return;
    }

    const css = trackColorAt(this.loaded, colorBy);
    const outline = style === 'outline';
    if (style === 'dashed') {
      // Dash material is single-colour, so draw one primitive per colour with a polyline per run.
      // Coarse vario buckets cap the number of colours, so materials stay few.
      const byColor = new Map<string, Cesium.GeometryInstance[]>();
      for (const run of colorRuns(fixes.length, trackColorAt(this.loaded, colorBy, true))) {
        const instance = new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({
            positions: positions.slice(path.index[run.start], path.index[run.end] + 1),
            width,
            arcType: Cesium.ArcType.NONE,
            vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
          })
        });
        byColor.set(run.color, [...(byColor.get(run.color) ?? []), instance]);
      }
      for (const [color, geometryInstances] of byColor) {
        this.add(
          new Cesium.Primitive({
            geometryInstances,
            appearance: new Cesium.PolylineMaterialAppearance({
              material: Cesium.Material.fromType('PolylineDash', {
                color: Cesium.Color.fromCssColorString(color).withAlpha(0.9),
                gapColor: Cesium.Color.TRANSPARENT,
                // One period is 16 bits, 11 on and 5 off gives dash 4 and gap 2 per 6 widths.
                dashLength: width * 6,
                dashPattern: 0b0000011111111111
              })
            }),
            asynchronous: false
          })
        );
      }
      return;
    }

    const colors = path.source.map((i) => Cesium.Color.fromCssColorString(css(i)).withAlpha(0.9));
    this.add(
      new Cesium.Primitive({
        geometryInstances: line(
          { colors, colorsPerVertex: true, vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT },
          outline ? width + OUTLINE_PX * 2 : width
        ),
        appearance: outline ? outlinedAppearance(width) : new Cesium.PolylineColorAppearance({ translucent: false }),
        asynchronous: false
      })
    );
  }

  private add(p: Cesium.Primitive) {
    p.show = this.loaded.visible;
    this.track.push(this.viewer.scene.primitives.add(p));
  }

  /**
   * Translucent wall from the track down to sea level. Depth testing against terrain hides
   * the part below ground, so no terrain sampling is needed.
   */
  private curtain(color: Cesium.Color): Cesium.Primitive {
    const { fixes } = this.loaded.flight;
    const positions: Cesium.Cartesian3[] = [];
    const heights: number[] = [];
    let last = -Infinity;
    fixes.forEach((f, i) => {
      if (f.t - last < CURTAIN_STEP_MS && i !== fixes.length - 1) return;
      last = f.t;
      positions.push(Cesium.Cartesian3.fromDegrees(f.lon, f.lat));
      heights.push((f.alt + this.loaded.altOffset) * this.getExaggeration());
    });
    return new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.WallGeometry({
          positions,
          maximumHeights: heights,
          minimumHeights: heights.map(() => 0),
          vertexFormat: Cesium.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT
        }),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.22)) }
      }),
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true }),
      asynchronous: false
    });
  }

  /**
   * Thermal columns and climb labels. Shown for the selected pilot only to limit clutter.
   * Each part has its own toggle, so either can be off while the other stays on.
   */
  renderThermals(show: boolean, units: Units, parts: { columns: boolean; labels: boolean }) {
    for (const e of this.thermals) this.viewer.entities.remove(e);
    this.thermals = [];
    if (!show || (!parts.columns && !parts.labels)) return;
    for (const th of this.loaded.climbs.thermals) {
      const mid = (th.entryAlt + th.exitAlt) / 2;
      // Hide the column while the pilot is circling in it, otherwise it blocks the chase camera.
      const outside = new Cesium.CallbackProperty(() => {
        const i = indexAt(this.loaded.flight.fixes, this.getTime());
        return i < th.start || i > th.end;
      }, false);
      const css = varioColor(th.avgClimb);
      this.thermals.push(
        this.viewer.entities.add({
          position: this.cartesian(th.centerLon, th.centerLat, mid, new Cesium.Cartesian3()),
          ...(parts.columns && {
            cylinder: {
              show: outside,
              length: th.gain * this.getExaggeration(),
              topRadius: 35,
              bottomRadius: 35,
              material: Cesium.Color.fromCssColorString(css).withAlpha(0.15),
              outline: false
            }
          }),
          ...(parts.labels && {
            label: {
              text: `+${formatAlt(th.gain, units)} · ${formatVario(th.avgClimb, units)}`,
              font: '12px sans-serif',
              fillColor: labelText(css),
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString(css).withAlpha(0.8),
              pixelOffset: new Cesium.Cartesian2(0, -10),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 30_000)
            }
          })
        })
      );
    }
  }

  /** Swaps in the latest state snapshot of this flight (state replaces objects on change). */
  update(loaded: LoadedFlight) {
    if (loaded.color !== this.loaded.color) this.recolor(loaded.color);
    this.loaded = loaded;
    this.setVisible(loaded.visible);
  }

  /** Pilot marker, label and tail take the pilot colour; the track picks it up in renderTrack. */
  private recolor(css: string) {
    const color = Cesium.Color.fromCssColorString(css);
    this.pilot.point!.color = new Cesium.ConstantProperty(color);
    this.pilot.label!.backgroundColor = new Cesium.ConstantProperty(color.withAlpha(0.7));
    this.tail.polyline!.material = new Cesium.PolylineGlowMaterialProperty({ color, glowPower: 0.25 });
  }

  setLabelVisible(visible: boolean) {
    this.pilot.label!.show = new Cesium.ConstantProperty(visible);
  }

  setVisible(visible: boolean) {
    for (const p of this.track) p.show = visible;
    this.pilot.show = visible;
    this.tail.show = visible;
  }

  /** Bounding sphere around the whole track, for the initial camera view. */
  boundingSphere(): Cesium.BoundingSphere {
    const { fixes } = this.loaded.flight;
    return Cesium.BoundingSphere.fromPoints(
      fixes.map((f) => this.cartesian(f.lon, f.lat, f.alt, new Cesium.Cartesian3()))
    );
  }

  destroy() {
    for (const p of this.track) this.viewer.scene.primitives.remove(p);
    this.viewer.entities.remove(this.pilot);
    this.viewer.entities.remove(this.tail);
    for (const e of this.thermals) this.viewer.entities.remove(e);
  }
}
