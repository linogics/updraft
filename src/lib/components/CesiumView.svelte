<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import * as Cesium from 'cesium';
  import { createViewer, sampleGroundHeight, setBasemap, setTerrain } from '#lib/cesium/viewer';
  import { FlightLayer } from '#lib/cesium/flightLayer';
  import { CameraController } from '#lib/cesium/cameraModes';
  import { loadRuntimeConfig } from '#lib/config';
  import { altitudeOffset } from '#lib/domain/align';
  import type { BasemapId, TerrainSource } from '#lib/domain/scene';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';

  let { replay }: { replay: ReplayState } = $props();

  let container: HTMLDivElement;
  let viewer: Cesium.Viewer | undefined = $state.raw();
  let ready = $state(false);
  let notice = $state('Loading 3D view…');
  const layers = new Map<string, FlightLayer>();

  /** Loads a terrain source and re-aligns every track so takeoff sits on the ground. */
  let terrainRequest = 0;
  let appliedTerrain: TerrainSource | undefined;
  let appliedBasemap: BasemapId | undefined;
  async function applyTerrain(v: Cesium.Viewer, source: TerrainSource) {
    const request = ++terrainRequest;
    appliedTerrain = source;
    notice = 'Loading terrain…';
    const used = await setTerrain(v, source);
    appliedTerrain = used;
    const offsets = new Map<string, number>();
    await Promise.all(
      replay.flights.map(async ({ flight }) => {
        const f0 = flight.fixes[0];
        offsets.set(flight.id, altitudeOffset(f0.alt, await sampleGroundHeight(v, used, f0.lat, f0.lon)));
      })
    );
    if (request !== terrainRequest || v.isDestroyed()) return;
    replay.setAltOffsets(offsets);
    if (used !== source) replay.terrain = used;
    notice = used !== source ? 'Cesium ion terrain failed to load: using AWS Terrain Tiles instead.' : '';
  }

  onMount(() => {
    let alive = true;
    let camera: CameraController | undefined;

    (async () => {
      const { cesiumIonToken } = await loadRuntimeConfig();
      if (!alive) return;
      appliedBasemap = replay.basemap;
      const v = createViewer(container, appliedBasemap, cesiumIonToken);
      viewer = v;
      await applyTerrain(v, replay.terrain);
      if (!alive) return;

      for (const lf of replay.flights) layers.set(lf.flight.id, new FlightLayer(v, lf, () => replay.time));
      camera = new CameraController(v);

      v.scene.preRender.addEventListener(() => {
        const sel = replay.selected;
        const layer = sel && layers.get(sel.flight.id);
        camera!.update(
          replay.camera,
          layer ? { position: layer.cartesianAt(replay.time), heading: layer.headingAt(replay.time) } : undefined
        );
      });

      const spheres = [...layers.values()].map((l) => l.boundingSphere());
      if (spheres.length) {
        v.camera.flyToBoundingSphere(Cesium.BoundingSphere.fromBoundingSpheres(spheres), { duration: 0 });
      }
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

  // Terrain dropdown: switch source after the initial load.
  $effect(() => {
    const source = replay.terrain;
    if (!ready || !viewer || source === appliedTerrain) return;
    const v = viewer;
    untrack(() => applyTerrain(v, source)).catch((err) => {
      console.error(err);
      notice = `Terrain failed to load: ${err instanceof Error ? err.message : err}`;
    });
  });

  $effect(() => {
    const id = replay.basemap;
    if (!ready || !viewer || id === appliedBasemap) return;
    appliedBasemap = id;
    setBasemap(viewer, id);
  });

  // Keep layers in sync with state snapshots (visibility, altitude and time offsets).
  $effect(() => {
    if (!ready) return;
    for (const lf of replay.flights) layers.get(lf.flight.id)?.update(lf);
  });

  // Rebuild tracks when colour mode or altitude offsets change (layers skip unchanged input).
  $effect(() => {
    if (!ready) return;
    const colorBy = replay.colorBy;
    for (const lf of replay.flights) layers.get(lf.flight.id)?.renderTrack(colorBy);
  });

  $effect(() => {
    if (!ready) return;
    const id = replay.selected?.flight.id;
    const units = unitPrefs.units;
    void replay.flights;
    for (const [key, layer] of layers) layer.renderThermals(key === id, units);
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
