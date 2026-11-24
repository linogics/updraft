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
  import { m } from '#lib/paraglide/messages';
  import type { Flight } from '#lib/domain/model';
  import { StudioState } from '#lib/state/studio.svelte';
  import { flightRepository } from '#lib/storage';

  const studio = new StudioState();
  let error = $state('');
  let loaded = $state(false);
  let footerTab = $state<'altitude' | 'timeline'>('altitude');
  let steps = $state<string[]>([m.studio_step_read_flights(), m.studio_step_thermals(), m.studio_step_camera()]);
  let step = $state(0);
  // Analysis runs synchronously, so let the browser paint the loader before each heavy step.
  let viewsWidth = $state(1);
  const panels = $derived(panelPrefs.value);
  const L = PANEL_LIMITS;
  const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));

  onMount(async () => {
    const scene = decodeScene(page.url.searchParams);
    studio.camera = scene.camera;
    studio.colorBy = scene.colorBy;
    studio.layout = scene.layout;
    studio.trackStyle = scene.trackStyle;
    studio.trackWidth = scene.trackWidth;
    studio.smoothTrack = scene.smoothTrack;
    studio.exaggeration = scene.exaggeration;
    studio.lighting = scene.lighting;
    studio.labels = scene.labels;
    studio.basemap = scene.basemap;
    const n = scene.flightIds.length;
    steps[0] = n === 1 ? m.studio_step_read_one() : m.studio_step_read_many({ count: n });
    const { cesiumIonToken } = await loadRuntimeConfig();
    studio.ionAvailable = !!cesiumIonToken;
    studio.terrain = resolveTerrain(scene.terrain, studio.ionAvailable);

    const flights = (await Promise.all(scene.flightIds.map((id) => flightRepository.get(id)))).filter(
      (f): f is Flight => !!f
    );
    if (!flights.length) {
      error = m.studio_none_found();
      return;
    }
    step = 1;
    await paint();
    studio.setFlights(flights, {
      syncMode: scene.sync,
      nudges: scene.nudges,
      thermalFilter: scene.thermalFilter,
      colors: scene.colors
    });
    step = 2;
    await studio.loadCameraTracks();
    // Flights from different days need aligning, so open the timeline first.
    if (studio.multiDay) footerTab = 'timeline';
    loaded = true;
  });

  onDestroy(() => studio.destroy());

  // Keep the URL in sync so a reload (and later a share link) restores the view.
  $effect(() => {
    if (!loaded) return;
    const query = encodeScene({
      flightIds: studio.flights.map((f) => f.flight.id),
      camera: studio.camera,
      colorBy: studio.colorBy,
      layout: studio.layout,
      basemap: studio.basemap,
      terrain: studio.terrain,
      sync: studio.syncMode,
      nudges: studio.nudges,
      thermalFilter: studio.thermalFilter,
      trackStyle: studio.trackStyle,
      trackWidth: studio.trackWidth,
      smoothTrack: studio.smoothTrack,
      colors: studio.colorOverrides,
      exaggeration: studio.exaggeration,
      lighting: studio.lighting,
      labels: studio.labels
    });
    goto(`?${query}`, { shallow: true, replace: true, reset: false });
  });

  function onKey(e: KeyboardEvent) {
    if (!loaded || (e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      studio.toggle();
    } else if (e.code === 'ArrowRight') studio.seek(studio.time + 30_000);
    else if (e.code === 'ArrowLeft') studio.seek(studio.time - 30_000);
  }
</script>

<svelte:head>
  <title>{m.studio_title()}</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

{#if error}
  <main class="error">
    <p>{error}</p>
    <a href="/">{m.home_open_logbook()}</a>
  </main>
{:else if loaded}
  <div
    class="app"
    data-layout={studio.layout}
    style:--outliner="{panels.outlinerOpen ? panels.outliner : 0}px"
    style:--side="{panels.sideOpen ? panels.side : 0}px"
    style:--chart="{panels.footer}px"
    style:--split="{panels.split * 100}%"
  >
    <header><Toolbar {studio} /></header>

    <nav class="outliner panel" hidden={!panels.outlinerOpen} aria-label={m.studio_outliner()}>
      <PilotList {studio} />
      <ThermalList {studio} />
    </nav>

    <div class="outliner-handle">
      <Splitter
        label={m.studio_outliner()}
        axis="x"
        value={panels.outliner}
        min={L.outliner.min}
        max={L.outliner.max}
        open={panels.outlinerOpen}
        onchange={(v) => panelPrefs.resize('outliner', v)}
        onreset={() => panelPrefs.reset('outliner')}
        ontoggle={() => panelPrefs.toggle('outlinerOpen')}
      />
    </div>

    <div class="views panel" bind:clientWidth={viewsWidth}>
      {#if studio.layout !== '2d'}
        <div class="view3d"><CesiumView {studio} /></div>
      {/if}
      {#if studio.layout === 'split'}
        <div class="split-handle">
          <Splitter
            label={m.studio_split_label()}
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
      {#if studio.layout !== '3d'}
        <div class="view2d"><MiniMap {studio} follow={studio.layout === '2d'} /></div>
      {/if}
    </div>

    <div class="side-handle">
      <Splitter
        label={m.studio_side_panel()}
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

    <aside class="panel" hidden={!panels.sideOpen}>
      <StatsPanel {studio} />
    </aside>

    <div class="footer-handle">
      <Splitter
        label={m.studio_bottom_panel()}
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

    <footer class="panel">
      <div class="transport">
        <PlayerBar {studio} />
        <div class="tabs" role="tablist" hidden={!panels.footerOpen}>
          <button role="tab" aria-selected={footerTab === 'altitude'} onclick={() => (footerTab = 'altitude')}>
            {m.studio_tab_altitude()}
          </button>
          <button role="tab" aria-selected={footerTab === 'timeline'} onclick={() => (footerTab = 'timeline')}>
            {studio.multiDay ? m.studio_timeline_multi_day() : m.timeline_label()}
          </button>
        </div>
      </div>
      <div class="chart" hidden={!panels.footerOpen}>
        {#if footerTab === 'altitude'}<AltitudeChart {studio} />{:else}<Timeline {studio} />{/if}
      </div>
    </footer>
  </div>
{:else}
  <LoadScreen {steps} {step} />
{/if}

<style>
  /* Editor layout: outliner | viewport | inspector over a full-width timeline. Splitters are the gutters. */
  .app {
    display: grid;
    grid-template-columns: var(--outliner) auto minmax(0, 1fr) auto var(--side);
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      'header header header header header'
      'outliner ohandle views vhandle aside'
      'fhandle fhandle fhandle fhandle fhandle'
      'footer footer footer footer footer';
    height: 100vh;
    height: 100dvh;
    padding: 0 6px 6px;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  header {
    grid-area: header;
  }
  .outliner {
    grid-area: outliner;
  }
  .outliner,
  aside {
    overflow-y: auto;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 20px;
  }
  aside {
    grid-area: aside;
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
  .outliner-handle,
  .side-handle,
  .footer-handle {
    display: flex;
  }
  .outliner-handle {
    grid-area: ohandle;
  }
  .side-handle {
    grid-area: vhandle;
  }
  .footer-handle {
    grid-area: fhandle;
    flex-direction: column;
  }
  .split-handle > :global(*),
  .outliner-handle > :global(*),
  .side-handle > :global(*),
  .footer-handle > :global(*) {
    flex: 1;
  }
  .outliner[hidden],
  aside[hidden],
  .chart[hidden],
  .tabs[hidden] {
    display: none;
  }
  footer {
    grid-area: footer;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 10px;
    border-bottom: 1px solid var(--border);
  }
  .transport > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .chart {
    height: var(--chart);
    padding: 6px 8px;
  }
  .tabs {
    display: flex;
    padding: 2px;
    border-radius: 7px;
    background: var(--surface-2);
  }
  .tabs button {
    border: 0;
    border-radius: 5px;
    background: none;
    padding: 4px 10px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    background: var(--bg);
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
      grid-template-rows: auto 55vh auto auto auto;
      grid-template-areas: 'header' 'views' 'footer' 'outliner' 'aside';
      row-gap: 6px;
      height: auto;
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
    .outliner-handle,
    .side-handle,
    .footer-handle {
      display: none;
    }
    .outliner[hidden],
    aside[hidden],
    .chart[hidden] {
      display: grid;
    }
    .tabs[hidden] {
      display: flex;
    }
    .chart {
      height: 150px;
    }
  }
</style>
