<script lang="ts">
  import { onMount } from 'svelte';
  import * as Cesium from 'cesium';
  import { createViewer, sampleGroundHeight } from '#lib/cesium/viewer';
  import { FlightLayer } from '#lib/cesium/flightLayer';
  import { CameraController } from '#lib/cesium/cameraModes';
  import { loadRuntimeConfig } from '#lib/config';
  import { altitudeOffset } from '#lib/domain/align';
  import type { ReplayState } from '#lib/state/replay.svelte';

  let { replay }: { replay: ReplayState } = $props();

  let container: HTMLDivElement;
  let ready = $state(false);
  let notice = $state('Loading 3D view…');
  const layers = new Map<string, FlightLayer>();

  onMount(() => {
    let alive = true;
    let viewer: Cesium.Viewer | undefined;
    let camera: CameraController | undefined;

    (async () => {
      const { cesiumIonToken } = await loadRuntimeConfig();
      const handle = await createViewer(container, cesiumIonToken);
      viewer = handle.viewer;
      if (!alive) return viewer.destroy();

      if (handle.hasTerrain) {
        const offsets = new Map<string, number>();
        await Promise.all(
          replay.flights.map(async ({ flight }) => {
            const f0 = flight.fixes[0];
            offsets.set(flight.id, altitudeOffset(f0.alt, await sampleGroundHeight(handle.viewer, f0.lat, f0.lon)));
          })
        );
        if (!alive) return;
        replay.setAltOffsets(offsets);
      }

      for (const lf of replay.flights) layers.set(lf.flight.id, new FlightLayer(handle.viewer, lf, () => replay.time));
      camera = new CameraController(handle.viewer);

      handle.viewer.scene.preRender.addEventListener(() => {
        const sel = replay.selected;
        const layer = sel && layers.get(sel.flight.id);
        camera!.update(
          replay.camera,
          layer ? { position: layer.cartesianAt(replay.time), heading: layer.headingAt(replay.time) } : undefined
        );
      });

      const spheres = [...layers.values()].map((l) => l.boundingSphere());
      if (spheres.length) {
        handle.viewer.camera.flyToBoundingSphere(Cesium.BoundingSphere.fromBoundingSpheres(spheres), { duration: 0 });
      }
      notice = handle.hasTerrain ? '' : 'No Cesium ion token configured: showing a flat map without terrain.';
      ready = true;
    })().catch((err) => {
      console.error(err);
      notice = `3D view failed to load: ${err instanceof Error ? err.message : err}`;
    });

    return () => {
      alive = false;
      for (const l of layers.values()) l.destroy();
      layers.clear();
      camera?.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  });

  // Keep layers in sync with state snapshots (visibility, altitude offsets).
  $effect(() => {
    if (!ready) return;
    for (const lf of replay.flights) layers.get(lf.flight.id)?.update(lf);
  });

  // Rebuild tracks when colour mode or offsets change.
  $effect(() => {
    if (!ready) return;
    const colorBy = replay.colorBy;
    for (const lf of replay.flights) layers.get(lf.flight.id)?.renderTrack(colorBy);
  });

  $effect(() => {
    if (!ready) return;
    const id = replay.selected?.flight.id;
    void replay.flights;
    for (const [key, layer] of layers) layer.renderThermals(key === id);
  });
</script>

<div class="cesium" bind:this={container}>
  {#if notice}<div class="notice">{notice}</div>{/if}
</div>

<style>
  .cesium {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .notice {
    position: absolute;
    z-index: 2;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: #eee;
    font-size: 12px;
    pointer-events: none;
  }
  .cesium :global(.cesium-viewer-bottom) {
    opacity: 0.6;
  }
</style>
