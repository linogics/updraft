import * as Cesium from 'cesium';

import type { CameraView } from '#lib/domain/cameraPath';
import { headingDelta } from '#lib/domain/geo';
import type { CameraMode } from '#lib/domain/scene';

/** Per-frame heading smoothing factor; keeps the chase cam calm while circling. */
const HEADING_SMOOTHING = 0.03;
/** Orbit rotation, degrees per frame. */
const ORBIT_SPEED = 0.15;
const MIN_RANGE = 40;
const MAX_RANGE = 20_000;

export interface CameraTarget {
  position: Cesium.Cartesian3;
  /** Degrees, 0 = north. */
  heading: number;
}

/**
 * Camera view of the pilot at pilot, as the camera would be seen from it: heading is the look
 * direction (camera to pilot), pitch negative when looking down, range in metres.
 */
export function viewFromCamera(camera: Cesium.Cartesian3, pilot: Cesium.Cartesian3): CameraView {
  const enu = Cesium.Matrix4.inverseTransformation(
    Cesium.Transforms.eastNorthUpToFixedFrame(pilot),
    new Cesium.Matrix4()
  );
  // Camera relative to the pilot in the pilot's east, north, up axes.
  const v = Cesium.Matrix4.multiplyByPoint(enu, camera, new Cesium.Cartesian3());
  const range = Cesium.Cartesian3.magnitude(v);
  // Look direction is from camera to pilot, so both horizontal axes flip.
  const heading = Cesium.Math.toDegrees(Math.atan2(-v.x, -v.y));
  return {
    heading: (heading + 360) % 360,
    pitch: Cesium.Math.toDegrees(Math.asin(-v.z / range)),
    range
  };
}

/** Drives the camera each frame according to the selected mode. */
export class CameraController {
  private smoothedHeading: number | undefined;
  private orbitAngle = 0;
  private lastMode: CameraMode | undefined;
  /** Distance to the pilot in follow / orbit, metres. Changed with the mouse wheel. */
  private range = 300;
  private removeWheel: () => void;

  constructor(private viewer: Cesium.Viewer) {
    const onWheel = (e: WheelEvent) => {
      if (this.lastMode !== 'follow' && this.lastMode !== 'orbit') return;
      e.preventDefault();
      this.range = Math.min(MAX_RANGE, Math.max(MIN_RANGE, this.range * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
    };

    viewer.canvas.addEventListener('wheel', onWheel, { passive: false });
    this.removeWheel = () => viewer.canvas.removeEventListener('wheel', onWheel);
  }

  /** view is the interpolated key view for 'keys' mode. Without it, keys act as follow. */
  update(mode: CameraMode, target: CameraTarget | undefined, view?: CameraView) {
    const camera = this.viewer.camera;

    if (mode !== this.lastMode) {
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      // Built-in mouse controls only in free mode; follow/orbit use our own wheel zoom.
      this.viewer.scene.screenSpaceCameraController.enableInputs = mode === 'free';
      this.lastMode = mode;
    }

    if (mode === 'free' || !target) return;

    // Keys are stateless: the view depends on playback time only, so export frames are repeatable.
    if (mode === 'keys' && view) {
      camera.lookAt(
        target.position,
        new Cesium.HeadingPitchRange(Cesium.Math.toRadians(view.heading), Cesium.Math.toRadians(view.pitch), view.range)
      );
      return;
    }

    this.smoothedHeading ??= target.heading;
    this.smoothedHeading =
      (this.smoothedHeading + headingDelta(this.smoothedHeading, target.heading) * HEADING_SMOOTHING + 360) % 360;

    if (mode === 'cockpit') {
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      camera.setView({
        destination: target.position,
        orientation: { heading: Cesium.Math.toRadians(this.smoothedHeading), pitch: Cesium.Math.toRadians(-8), roll: 0 }
      });
      return;
    }

    const heading = mode === 'orbit' ? (this.orbitAngle = (this.orbitAngle + ORBIT_SPEED) % 360) : this.smoothedHeading;
    const pitch = mode === 'orbit' ? -25 : -18;
    camera.lookAt(
      target.position,
      new Cesium.HeadingPitchRange(Cesium.Math.toRadians(heading), Cesium.Math.toRadians(pitch), this.range)
    );
  }

  destroy() {
    this.removeWheel();
  }
}
