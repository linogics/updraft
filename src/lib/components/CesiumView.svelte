<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import * as Cesium from 'cesium';
  import { beginCapture, captureFrame } from '#lib/cesium/capture';
  import { createViewer, sampleGroundHeight, setBasemap, setTerrain } from '#lib/cesium/viewer';
  import { FlightLayer } from '#lib/cesium/flightLayer';
  import { XcRoute } from '#lib/cesium/xcRoute';
  import { AirspaceLayer } from '#lib/cesium/airspaceLayer';
  import { airspacePrefs } from '#lib/airspace/prefs.svelte';
  import { ThermalLayer } from '#lib/cesium/thermalLayer';
  import { thermalOverlayPrefs } from '#lib/thermals/prefs.svelte';
  import { loadAirspaces, type AirspaceFeature } from '#lib/airspace/tiles';
  import { CameraController, viewFromCamera } from '#lib/cesium/cameraModes';
  import { loadRuntimeConfig } from '#lib/config';
  import { m } from '#lib/paraglide/messages';
  import { altitudeOffset } from '#lib/domain/align';
  import { viewAt } from '#lib/domain/cameraPath';
  import type { BasemapId, TerrainSource } from '#lib/domain/scene';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { thermalPrefs } from '#lib/state/thermalPrefs.svelte';

  let { studio }: { studio: StudioState } = $props();

  let container: HTMLDivElement;
  let viewer: Cesium.Viewer | undefined = $state.raw();
  let ready = $state(false);
  let notice = $state<string>(m.cesium_loading_view());
  // Plain registry read by imperative code, never by templates.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const layers = new Map<string, FlightLayer>();
  let xcRoute: XcRoute | undefined = $state.raw();
  let airspaceLayer: AirspaceLayer | undefined = $state.raw();
  let airspaces: AirspaceFeature[] = $state.raw([]);
  let thermalLayer: ThermalLayer | undefined = $state.raw();
  let airspaceRequest = '';

  /** Loads a terrain source and re-aligns every track so takeoff sits on the ground. */
  let terrainRequest = 0;
  let appliedTerrain: TerrainSource | undefined;
  let appliedBasemap: BasemapId | undefined;
  async function applyTerrain(v: Cesium.Viewer, source: TerrainSource) {
    const request = ++terrainRequest;
    appliedTerrain = source;
    notice = m.cesium_loading_terrain();
    const used = await setTerrain(v, source);
    appliedTerrain = used;
    // Local lookup handed to studio state once, not reactive itself.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const offsets = new Map<string, number>();
    await Promise.all(
      studio.flights.map(async ({ flight }) => {
        const f0 = flight.fixes[0];
        offsets.set(flight.id, altitudeOffset(f0.alt, await sampleGroundHeight(v, used, f0.lat, f0.lon)));
      })
    );
    if (request !== terrainRequest || v.isDestroyed()) return;
    studio.setAltOffsets(offsets);
    if (used !== source) studio.terrain = used;
    notice = used !== source ? m.cesium_ion_fallback() : '';
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
      appliedBasemap = studio.basemap;
      const v = createViewer(container, appliedBasemap, cesiumIonToken);
      viewer = v;
      studio.viewer = v;
      await applyTerrain(v, studio.terrain);
      if (!alive) return;

      for (const lf of studio.flights)
        layers.set(
          lf.flight.id,
          new FlightLayer(
            v,
            lf,
            () => studio.time,
            () => studio.exaggeration
          )
        );
      camera = new CameraController(v);
      xcRoute = new XcRoute(v);
      airspaceLayer = new AirspaceLayer(v);
      thermalLayer = new ThermalLayer(v);

      v.scene.preRender.addEventListener(() => {
        const sel = studio.selected;
        // Sun position follows the recorded clock of the selected flight.
        if (studio.lighting && sel) Cesium.JulianDate.fromDate(new Date(studio.localTime(sel)), v.clock.currentTime);
        const layer = sel && layers.get(sel.flight.id);
        if (cameraHold) return;
        const view = studio.camera === 'keys' ? viewAt(studio.cameraTracks, studio.time) : undefined;
        camera!.update(
          studio.camera,
          layer ? { position: layer.cartesianAt(studio.time), heading: layer.headingAt(studio.time) } : undefined,
          view
        );
      });

      const spheres = [...layers.values()].map((l) => l.boundingSphere());
      if (spheres.length) {
        v.camera.flyToBoundingSphere(Cesium.BoundingSphere.fromBoundingSpheres(spheres), { duration: 0 });
      }

      studio.capture = (w, h) => captureFrame(v, w, h, setHold);
      studio.beginCapture = (w, h) => beginCapture(v, w, h, setHold);
      studio.captureCameraView = () => {
        const sel = studio.selected;
        const layer = sel && layers.get(sel.flight.id);
        if (!layer) return null;
        return viewFromCamera(v.camera.position, layer.cartesianAt(studio.time, new Cesium.Cartesian3()));
      };

      ready = true;
    })().catch((err) => {
      console.error(err);
      notice = m.cesium_view_failed({ message: String(err instanceof Error ? err.message : err) });
    });

    return () => {
      alive = false;
      studio.viewer = null;
      studio.capture = null;
      studio.beginCapture = null;
      studio.captureCameraView = null;
      for (const l of layers.values()) l.destroy();
      layers.clear();
      camera?.destroy();
      xcRoute?.destroy();
      airspaceLayer?.destroy();
      thermalLayer?.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  });

  // Fetch airspaces for the loaded flights (+5 km margin), only when the box or key changes.
  $effect(() => {
    const fixes = studio.flights.flatMap((lf) => lf.flight.fixes);
    const key = airspacePrefs.key;
    if (!ready || !airspacePrefs.show || !key || !fixes.length) return;
    let s = 90,
      n = -90,
      w = 180,
      e = -180;

    for (const f of fixes) {
      s = Math.min(s, f.lat);
      n = Math.max(n, f.lat);
      w = Math.min(w, f.lon);
      e = Math.max(e, f.lon);
    }

    const dLat = 5 / 111;
    const dLon = dLat / Math.max(0.1, Math.cos((((s + n) / 2) * Math.PI) / 180));
    const bbox: [number, number, number, number] = [w - dLon, s - dLat, e + dLon, n + dLat];
    const id = bbox.map((x) => x.toFixed(3)).join() + key;
    if (id === airspaceRequest) return;
    airspaceRequest = id;
    loadAirspaces(bbox, key)
      .then((f) => {
        if (airspaceRequest === id) airspaces = f;
      })
      .catch((err) => console.error(err));
  });

  $effect(() => {
    if (!ready || !airspaceLayer) return;
    const { show, classes, maxFloor, opacity, key } = airspacePrefs;
    airspaceLayer.set(show && key ? airspaces : [], { show, classes, maxFloor, opacity }, studio.exaggeration);
  });

  $effect(() => {
    if (!ready || !thermalLayer) return;
    const { hotspots, skyways, opacity } = thermalOverlayPrefs;
    thermalLayer.set({ hotspots, skyways, opacity });
  });

  // Terrain dropdown: switch source after the initial load.
  $effect(() => {
    const source = studio.terrain;
    if (!ready || !viewer || source === appliedTerrain) return;
    const v = viewer;
    untrack(() => applyTerrain(v, source)).catch((err) => {
      console.error(err);
      notice = m.cesium_terrain_failed({ message: String(err instanceof Error ? err.message : err) });
    });
  });

  $effect(() => {
    const id = studio.basemap;
    if (!ready || !viewer || id === appliedBasemap) return;
    appliedBasemap = id;
    setBasemap(viewer, id);
  });

  $effect(() => {
    if (!ready || !viewer) return;
    viewer.scene.verticalExaggeration = studio.exaggeration;
    viewer.scene.globe.enableLighting = studio.lighting;
    viewer.scene.requestRender();
  });

  $effect(() => {
    if (!ready) return;
    const show = studio.labels;
    for (const layer of layers.values()) layer.setLabelVisible(show);
  });

  // Keep layers in sync with state snapshots (visibility, altitude and time offsets).
  $effect(() => {
    if (!ready) return;
    for (const lf of studio.flights) layers.get(lf.flight.id)?.update(lf);
  });

  // Rebuild tracks when colour mode, style, width, colours or altitude offsets change (layers skip unchanged input).
  $effect(() => {
    if (!ready) return;
    const { colorBy, trackStyle, trackWidth, smoothTrack } = studio;
    void studio.exaggeration;
    for (const lf of studio.flights)
      layers.get(lf.flight.id)?.renderTrack(colorBy, trackStyle, trackWidth, smoothTrack);
  });

  $effect(() => {
    if (!ready) return;
    const id = studio.selected?.flight.id;
    const units = unitPrefs.units;
    const parts = { columns: thermalPrefs.columns, labels: thermalPrefs.labels };
    void studio.flights;
    void studio.exaggeration;
    for (const [key, layer] of layers) layer.renderThermals(key === id, units, parts);
  });

  $effect(() => {
    xcRoute?.set(studio.selected?.xc);
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
    left: 0;
    bottom: 0;
    width: 40%;
    height: 2px;
    background: var(--primary);
    animation: sweep 1s linear infinite;
  }
  @keyframes sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }
  .cesium :global(.cesium-viewer-bottom) {
    opacity: 0.6;
  }
</style>
