import type * as Cesium from 'cesium';

import { m } from '../paraglide/messages';

/** Longest wait for globe tiles per frame before grabbing it anyway. */
const TILE_WAIT_MS = 15_000;

export interface CaptureSession {
  /** Renders one frame at the session size and copies it into target (a new canvas by default). */
  frame(target?: HTMLCanvasElement): Promise<HTMLCanvasElement>;
  /** Restores the viewer. Safe to call twice. */
  end(): void;
}

export type BeginCapture = (width: number, height: number) => Promise<CaptureSession>;

// About one display frame between tile-wait renders, so waiting does not spin the GPU.
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

/**
 * Takes over rendering of the viewer at width x height device pixels. The default render loop
 * stops, so frames only come from frame(). setHold(true) tells the camera to stay put while
 * extra renders wait for tiles, so each output frame moves the camera exactly once.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- async turns the unavailable-viewer throw into a rejection
export async function beginCapture(
  viewer: Cesium.Viewer,
  width: number,
  height: number,
  setHold: (hold: boolean) => void
): Promise<CaptureSession> {
  if (viewer.isDestroyed()) throw new Error(m.capture_unavailable());
  const container = viewer.container as HTMLElement;
  const { style } = container;
  const saved = { width: style.width, height: style.height, loop: viewer.useDefaultRenderLoop };
  // Same factor Cesium uses to size the canvas buffer from its CSS size.
  const ratio = (viewer.useBrowserRecommendedResolution ? 1 : window.devicePixelRatio) * viewer.resolutionScale;
  let ended = false;

  // Hold first: a render already queued by the loop must not move the camera.
  setHold(true);
  viewer.useDefaultRenderLoop = false;
  style.width = `${width / ratio}px`;
  style.height = `${height / ratio}px`;
  viewer.resize();

  const render = () => viewer.scene.render(viewer.clock.currentTime);

  return {
    async frame(target = document.createElement('canvas')) {
      if (ended || viewer.isDestroyed()) throw new Error(m.capture_closed());
      setHold(false);
      render();
      setHold(true);
      const deadline = performance.now() + TILE_WAIT_MS;
      // Each loop ends right after a render, so the copy below reads that fresh frame.
      while (!viewer.scene.globe.tilesLoaded && performance.now() < deadline) {
        await pause();
        if (ended || viewer.isDestroyed()) throw new Error(m.capture_closed());
        render();
      }

      // Assigning a size clears the canvas, so only do it when it changes.
      if (target.width !== width) target.width = width;
      if (target.height !== height) target.height = height;
      target.getContext('2d')!.drawImage(viewer.scene.canvas, 0, 0, width, height);
      return target;
    },
    end() {
      if (ended) return;
      ended = true;
      setHold(false);
      if (viewer.isDestroyed()) return;
      style.width = saved.width;
      style.height = saved.height;
      viewer.useDefaultRenderLoop = saved.loop;
      viewer.resize();
    }
  };
}

/** One frame at width x height, with the viewer restored afterwards. */
export async function captureFrame(
  viewer: Cesium.Viewer,
  width: number,
  height: number,
  setHold: (hold: boolean) => void
): Promise<HTMLCanvasElement> {
  const session = await beginCapture(viewer, width, height, setHold);
  try {
    return await session.frame();
  } finally {
    session.end();
  }
}
