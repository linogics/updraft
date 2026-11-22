import type * as Cesium from 'cesium';

/** Longest wait for globe tiles at the new size before grabbing the frame anyway. */
const TILE_WAIT_MS = 15_000;

/** Resolves once the globe has no pending tiles, or after the timeout. */
function tilesReady(viewer: Cesium.Viewer): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const remove = viewer.scene.postRender.addEventListener(() => {
      if (!viewer.scene.globe.tilesLoaded) return;
      remove();
      clearTimeout(timer);
      resolve();
    });
    timer = window.setTimeout(() => {
      remove();
      resolve();
    }, TILE_WAIT_MS);
  });
}

/**
 * Renders the 3D scene at width x height device pixels and returns a copy.
 * Resizes the container, so the viewer is restored in finally.
 */
export async function captureFrame(viewer: Cesium.Viewer, width: number, height: number): Promise<HTMLCanvasElement> {
  if (viewer.isDestroyed()) throw new Error('3D view is not available.');
  const container = viewer.container as HTMLElement;
  const { style } = container;
  const saved = { width: style.width, height: style.height };
  // Same factor Cesium uses to size the canvas buffer from its CSS size.
  const ratio = (viewer.useBrowserRecommendedResolution ? 1 : window.devicePixelRatio) * viewer.resolutionScale;
  try {
    style.width = `${width / ratio}px`;
    style.height = `${height / ratio}px`;
    viewer.resize();
    await tilesReady(viewer);
    if (viewer.isDestroyed()) throw new Error('3D view was closed during export.');
    // Same task as render(): the WebGL buffer is cleared once the frame is composited.
    viewer.scene.render(viewer.clock.currentTime);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    out.getContext('2d')!.drawImage(viewer.scene.canvas, 0, 0, width, height);
    return out;
  } finally {
    style.width = saved.width;
    style.height = saved.height;
    if (!viewer.isDestroyed()) viewer.resize();
  }
}
