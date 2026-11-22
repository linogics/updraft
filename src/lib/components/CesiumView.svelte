<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import * as Cesium from 'cesium';
  import { beginCapture, captureFrame } from '#lib/cesium/capture';
  import { createViewer, sampleGroundHeight, setBasemap, setTerrain } from '#lib/cesium/viewer';
  import { FlightLayer } from '#lib/cesium/flightLayer';
  import { CameraController, viewFromCamera } from '#lib/cesium/cameraModes';
  import { loadRuntimeConfig } from '#lib/config';
  import { altitudeOffset } from '#lib/domain/align';
  import { viewAt } from '#lib/domain/cameraPath';
  import type { BasemapId, TerrainSource } from '#lib/domain/scene';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { thermalPrefs } from '#lib/state/thermalPrefs.svelte';

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
    // Set while a capture renders extra frames for tiles, so the camera does not move again.
    let cameraHold = false;
    const setHold = (hold: boolean) => (cameraHold = hold);

    (async () => {
      const { cesiumIonToken } = await loadRuntimeConfig();
      if (!alive) return;
      appliedBasemap = replay.basemap;
      const v = createViewer(container, appliedBasemap, cesiumIonToken);
      viewer = v;
      await applyTerrain(v, replay.terrain);
      if (!alive) return;

      for (const lf of replay.flights) layers.set(lf.flight.id, new FlightLayer(v, lf, () => replay.time, () => replay.exaggeration));
      camera = new CameraController(v);

      v.scene.preRender.addEventListener(() => {
        const sel = replay.selected;
        // Sun position follows the recorded clock of the selected flight.
        if (replay.lighting && sel) Cesium.JulianDate.fromDate(new Date(replay.localTime(sel)), v.clock.currentTime);
        const layer = sel && layers.get(sel.flight.id);
        if (cameraHold) return;
        const view = replay.camera === 'keys' ? viewAt(replay.cameraTracks, replay.time) : undefined;
        camera!.update(
          replay.camera,
          layer ? { position: layer.cartesianAt(replay.time), heading: layer.headingAt(replay.time) } : undefined,
          view
        );
      });

      const spheres = [...layers.values()].map((l) => l.boundingSphere());
      if (spheres.length) {
        v.camera.flyToBoundingSphere(Cesium.BoundingSphere.fromBoundingSpheres(spheres), { duration: 0 });
      }
      replay.capture = (w, h) => captureFrame(v, w, h, setHold);
      replay.beginCapture = (w, h) => beginCapture(v, w, h, setHold);
      replay.captureCameraView = () => {
        const sel = replay.selected;
        const layer = sel && layers.get(sel.flight.id);
        if (!layer) return null;
        return viewFromCamera(v.camera.position, layer.cartesianAt(replay.time, new Cesium.Cartesian3()));
      };
      ready = true;
    })().catch((err) => {
      console.error(err);
      notice = `3D view failed to load: ${err instanceof Error ? err.message : err}`;
    });

    return () => {
      alive = false;
      replay.capture = null;
      replay.beginCapture = null;
      replay.captureCameraView = null;
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

  $effect(() => {
    if (!ready || !viewer) return;
    viewer.scene.verticalExaggeration = replay.exaggeration;
    viewer.scene.globe.enableLighting = replay.lighting;
    viewer.scene.requestRender();
  });

  $effect(() => {
    if (!ready) return;
    const show = replay.labels;
    for (const layer of layers.values()) layer.setLabelVisible(show);
  });

  // Keep layers in sync with state snapshots (visibility, altitude and time offsets).
  $effect(() => {
    if (!ready) return;
    for (const lf of replay.flights) layers.get(lf.flight.id)?.update(lf);
  });

  // Rebuild tracks when colour mode, style, width, colours or altitude offsets change (layers skip unchanged input).
  $effect(() => {
    if (!ready) return;
    const { colorBy, trackStyle, trackWidth } = replay;
    void replay.exaggeration;
    for (const lf of replay.flights) layers.get(lf.flight.id)?.renderTrack(colorBy, trackStyle, trackWidth);
  });

  $effect(() => {
    if (!ready) return;
    const id = replay.selected?.flight.id;
    const units = unitPrefs.units;
    const parts = { columns: thermalPrefs.columns, labels: thermalPrefs.labels };
    void replay.flights;
    void replay.exaggeration;
    for (const [key, layer] of layers) layer.renderThermals(key === id, units, parts);
  });
</script>

<div class="cesium" bind:this={container}>
  <!-- Loading notices end in an ellipsis, errors do not. -->
  {#if notice}<div class="notice" class:loading={notice.endsWith('…')} role="status">{notice}</div>{/if}
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
    overflow: hidden;
  }
  .notice.loading::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--needle), transparent) no-repeat;
    background-size: 40% 100%;
    animation: sweep 1s linear infinite;
  }
  @keyframes sweep {
    from {
      background-position: -40% 0;
    }
    to {
      background-position: 140% 0;
    }
  }
  .cesium :global(.cesium-viewer-bottom) {
    opacity: 0.6;
  }
</style>
