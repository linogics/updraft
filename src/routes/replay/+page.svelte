<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import AltitudeChart from '#lib/components/AltitudeChart.svelte';
  import CesiumView from '#lib/components/CesiumView.svelte';
  import MiniMap from '#lib/components/MiniMap.svelte';
  import PilotList from '#lib/components/PilotList.svelte';
  import PlayerBar from '#lib/components/PlayerBar.svelte';
  import StatsPanel from '#lib/components/StatsPanel.svelte';
  import ThermalList from '#lib/components/ThermalList.svelte';
  import Toolbar from '#lib/components/Toolbar.svelte';
  import { decodeScene, encodeScene } from '#lib/domain/scene';
  import type { Flight } from '#lib/domain/model';
  import { ReplayState } from '#lib/state/replay.svelte';
  import { flightRepository } from '#lib/storage';

  const replay = new ReplayState();
  let error = $state('');
  let loaded = $state(false);

  onMount(async () => {
    const scene = decodeScene(page.url.searchParams);
    replay.camera = scene.camera;
    replay.colorBy = scene.colorBy;
    replay.layout = scene.layout;

    const flights = (await Promise.all(scene.flightIds.map((id) => flightRepository.get(id)))).filter(
      (f): f is Flight => !!f
    );
    if (!flights.length) {
      error = 'None of the requested flights were found in this browser.';
      return;
    }
    replay.setFlights(flights);
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
      layout: replay.layout
    });
    replaceState(`?${query}`, {});
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

<svelte:window onkeydown={onKey} />

{#if error}
  <main class="error">
    <p>{error}</p>
    <a href="/">Back to flights</a>
  </main>
{:else if loaded}
  <div class="app" data-layout={replay.layout}>
    <header><Toolbar {replay} /></header>

    <div class="views">
      {#if replay.layout !== '2d'}
        <div class="view3d"><CesiumView {replay} /></div>
      {/if}
      {#if replay.layout !== '3d'}
        <div class="view2d"><MiniMap {replay} follow={replay.layout === '2d'} /></div>
      {/if}
    </div>

    <aside>
      <PilotList {replay} />
      <StatsPanel {replay} />
      <ThermalList {replay} />
    </aside>

    <footer>
      <PlayerBar {replay} />
      <div class="chart"><AltitudeChart {replay} /></div>
    </footer>
  </div>
{:else}
  <main class="error"><p>Loading flights…</p></main>
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: 1fr 320px;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      'header header'
      'views aside'
      'footer footer';
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
  .app[data-layout='split'] .view2d {
    border-left: 2px solid var(--border);
  }
  aside {
    grid-area: aside;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 20px;
    background: var(--surface);
    border-left: 1px solid var(--border);
  }
  footer {
    grid-area: footer;
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .chart {
    height: 150px;
    padding: 0 8px 6px;
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
    .app[data-layout='split'] .view2d {
      border-left: 0;
      border-top: 2px solid var(--border);
    }
  }
</style>
