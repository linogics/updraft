<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import AltitudeChart from '#lib/components/AltitudeChart.svelte';
  import CesiumView from '#lib/components/CesiumView.svelte';
  import LoadScreen from '#lib/components/LoadScreen.svelte';
  import Splitter from '#lib/components/Splitter.svelte';
  import { PANEL_LIMITS } from '#lib/state/panelPrefs';
  import { panelPrefs } from '#lib/state/panelPrefs.svelte';
  import MiniMap from '#lib/components/MiniMap.svelte';
  import PilotList from '#lib/components/PilotList.svelte';
  import PlayerBar from '#lib/components/PlayerBar.svelte';
  import StatsPanel from '#lib/components/StatsPanel.svelte';
  import ThermalList from '#lib/components/ThermalList.svelte';
  import Timeline from '#lib/components/Timeline.svelte';
  import Toolbar from '#lib/components/Toolbar.svelte';
  import { loadRuntimeConfig } from '#lib/config';
  import { decodeScene, encodeScene, resolveTerrain } from '#lib/domain/scene';
  import type { Flight } from '#lib/domain/model';
  import { ReplayState } from '#lib/state/replay.svelte';
  import { flightRepository } from '#lib/storage';

  const replay = new ReplayState();
  let error = $state('');
  let loaded = $state(false);
  let footerTab = $state<'altitude' | 'timeline'>('altitude');
  let steps = $state(['Reading flights', 'Finding thermals and glides', 'Loading camera keys']);
  let step = $state(0);
  // Analysis runs synchronously, so let the browser paint the loader before each heavy step.
  let viewsWidth = $state(1);
  const panels = $derived(panelPrefs.value);
  const L = PANEL_LIMITS;
  const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));

  onMount(async () => {
    const scene = decodeScene(page.url.searchParams);
    replay.camera = scene.camera;
    replay.colorBy = scene.colorBy;
    replay.layout = scene.layout;
    replay.trackStyle = scene.trackStyle;
    replay.trackWidth = scene.trackWidth;
    replay.smoothTrack = scene.smoothTrack;
    replay.exaggeration = scene.exaggeration;
    replay.lighting = scene.lighting;
    replay.labels = scene.labels;
    replay.basemap = scene.basemap;
    const n = scene.flightIds.length;
    steps[0] = `Reading ${n} flight${n === 1 ? '' : 's'}`;
    const { cesiumIonToken } = await loadRuntimeConfig();
    replay.ionAvailable = !!cesiumIonToken;
    replay.terrain = resolveTerrain(scene.terrain, replay.ionAvailable);

    const flights = (await Promise.all(scene.flightIds.map((id) => flightRepository.get(id)))).filter(
      (f): f is Flight => !!f
    );
    if (!flights.length) {
      error = 'None of the requested flights were found in this browser.';
      return;
    }
    step = 1;
    await paint();
    replay.setFlights(flights, { syncMode: scene.sync, nudges: scene.nudges, thermalFilter: scene.thermalFilter, colors: scene.colors });
    step = 2;
    await replay.loadCameraTracks();
    // Flights from different days need aligning, so open the timeline first.
    if (replay.multiDay) footerTab = 'timeline';
    loaded = true;
  });

  onDestroy(() => replay.destroy());

  // Keep the URL in sync so a reload (and later a share link) restores the view.
  $effect(() => {
    if (!loaded) return;
    const query = encodeScene({
      flightIds: replay.flights.map((f) => f.flight.id),
      camera: replay.camera,
      colorBy: replay.colorBy,
      layout: replay.layout,
      basemap: replay.basemap,
      terrain: replay.terrain,
      sync: replay.syncMode,
      nudges: replay.nudges,
      thermalFilter: replay.thermalFilter,
      trackStyle: replay.trackStyle,
      trackWidth: replay.trackWidth,
      smoothTrack: replay.smoothTrack,
      colors: replay.colorOverrides,
      exaggeration: replay.exaggeration,
      lighting: replay.lighting,
      labels: replay.labels
    });
    goto(`?${query}`, { shallow: true, replace: true, reset: false });
  });

  function onKey(e: KeyboardEvent) {
    if (!loaded || (e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      replay.toggle();
    } else if (e.code === 'ArrowRight') replay.seek(replay.time + 30_000);
    else if (e.code === 'ArrowLeft') replay.seek(replay.time - 30_000);
  }
</script>

<svelte:head>
  <title>Replay | updraft</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

{#if error}
  <main class="error">
    <p>{error}</p>
    <a href="/logbook">Open the logbook</a>
  </main>
{:else if loaded}
  <div
    class="app"
    data-layout={replay.layout}
    style:--side="{panels.sideOpen ? panels.side : 0}px"
    style:--chart="{panels.footer}px"
    style:--split="{panels.split * 100}%"
  >
    <header><Toolbar {replay} /></header>

    <div class="views" bind:clientWidth={viewsWidth}>
      {#if replay.layout !== '2d'}
        <div class="view3d"><CesiumView {replay} /></div>
      {/if}
      {#if replay.layout === 'split'}
        <div class="split-handle">
          <Splitter
            label="3D and 2D split"
            axis="x"
            value={panels.split}
            min={L.split.min}
            max={L.split.max}
            scale={1 / viewsWidth}
            onchange={(v) => panelPrefs.resize('split', v)}
            onreset={() => panelPrefs.reset('split')}
          />
        </div>
      {/if}
      {#if replay.layout !== '3d'}
        <div class="view2d"><MiniMap {replay} follow={replay.layout === '2d'} /></div>
      {/if}
    </div>

    <div class="side-handle">
      <Splitter
        label="Side panel"
        axis="x"
        sign={-1}
        value={panels.side}
        min={L.side.min}
        max={L.side.max}
        open={panels.sideOpen}
        onchange={(v) => panelPrefs.resize('side', v)}
        onreset={() => panelPrefs.reset('side')}
        ontoggle={() => panelPrefs.toggle('sideOpen')}
      />
    </div>

    <aside hidden={!panels.sideOpen}>
      <PilotList {replay} />
      <StatsPanel {replay} />
      <ThermalList {replay} />
    </aside>

    <div class="footer-handle">
      <Splitter
        label="Bottom panel"
        axis="y"
        sign={-1}
        value={panels.footer}
        min={L.footer.min}
        max={L.footer.max}
        open={panels.footerOpen}
        onchange={(v) => panelPrefs.resize('footer', v)}
        onreset={() => panelPrefs.reset('footer')}
        ontoggle={() => panelPrefs.toggle('footerOpen')}
      />
    </div>

    <footer>
      <PlayerBar {replay} />
      <div class="footer-body" hidden={!panels.footerOpen}>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={footerTab === 'altitude'} onclick={() => (footerTab = 'altitude')}>Altitude</button>
        <button role="tab" aria-selected={footerTab === 'timeline'} onclick={() => (footerTab = 'timeline')}>
          Timeline{replay.multiDay ? ' · multi-day' : ''}
        </button>
      </div>
      <div class="chart">
        {#if footerTab === 'altitude'}<AltitudeChart {replay} />{:else}<Timeline {replay} />{/if}
      </div>
      </div>
    </footer>
  </div>
{:else}
  <LoadScreen {steps} {step} />
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto var(--side);
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      'header header header'
      'views vhandle aside'
      'fhandle fhandle fhandle'
      'footer footer footer';
    height: 100vh;
    height: 100dvh;
  }
  header {
    grid-area: header;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .views {
    grid-area: views;
    position: relative;
    display: flex;
    min-height: 0;
  }
  .view3d,
  .view2d {
    flex: 1;
    min-width: 0;
    position: relative;
  }
  .app[data-layout='split'] .view3d {
    flex: 0 0 var(--split);
  }
  .split-handle,
  .side-handle,
  .footer-handle {
    display: flex;
  }
  .side-handle {
    grid-area: vhandle;
  }
  .footer-handle {
    grid-area: fhandle;
    flex-direction: column;
  }
  .split-handle > :global(*),
  .side-handle > :global(*),
  .footer-handle > :global(*) {
    flex: 1;
  }
  aside {
    grid-area: aside;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 20px;
    background: var(--surface);
  }
  aside[hidden],
  .footer-body[hidden] {
    display: none;
  }
  footer {
    grid-area: footer;
    background: var(--surface);
  }
  .chart {
    height: var(--chart);
    padding: 0 8px 6px;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 12px;
  }
  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: none;
    padding: 2px 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: #3987e5;
  }
  .error {
    display: grid;
    place-items: center;
    height: 100vh;
    color: var(--muted);
  }
  .error a {
    color: var(--text);
  }

  @media (max-width: 800px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto 55vh auto auto;
      grid-template-areas: 'header' 'views' 'footer' 'aside';
      height: auto;
    }
    aside {
      border-left: 0;
    }
    .app[data-layout='split'] .views {
      flex-direction: column;
    }
    .app[data-layout='split'] .view3d {
      flex: 1;
    }
    .app[data-layout='split'] .view2d {
      border-top: 2px solid var(--border);
    }
    /* Stacked phone layout: panels flow, no resizing. */
    .split-handle,
    .side-handle,
    .footer-handle {
      display: none;
    }
    aside[hidden] {
      display: grid;
    }
    .footer-body[hidden] {
      display: block;
    }
    .chart {
      height: 150px;
    }
  }
</style>
