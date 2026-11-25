<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import CesiumView from '#lib/components/CesiumView.svelte';
  import LoadScreen from '#lib/components/LoadScreen.svelte';
  import Splitter from '#lib/components/Splitter.svelte';
  import Dock from '#lib/components/studio/Dock.svelte';
  import { panelStatus } from '#lib/components/studio/panelActions.svelte';
  import { drag } from '#lib/components/studio/panelDrag.svelte';
  import { DOCK_LABELS, DOCKS } from '#lib/studio/panels';
  import { LAYOUT_LIMITS as L } from '#lib/state/studioLayout';
  import { studioLayout } from '#lib/state/studioLayout.svelte';
  import MiniMap from '#lib/components/MiniMap.svelte';
  import PlayerBar from '#lib/components/PlayerBar.svelte';
  import Toolbar from '#lib/components/Toolbar.svelte';
  import { loadRuntimeConfig } from '#lib/config';
  import { decodeScene, encodeScene, resolveTerrain } from '#lib/domain/scene';
  import { m } from '#lib/paraglide/messages';
  import type { Flight } from '#lib/domain/model';
  import { trackFiles } from '#lib/ui/trackFiles';
  import { importAndAdd } from '#lib/studio/addPilots';
  import { StudioState } from '#lib/state/studio.svelte';
  import { provideStudioService } from '#lib/studio/studioService.svelte';
  import { provideAnalysisService } from '#lib/studio/analysisService.svelte';
  import { flightRepository } from '#lib/storage';
  import { syncClient } from '#lib/sync/client.svelte';

  const studio = new StudioState();
  let error = $state('');
  let loaded = $state(false);
  let steps = $state<string[]>([m.studio_step_read_flights(), m.studio_step_thermals(), m.studio_step_camera()]);
  let step = $state(0);
  // Analysis runs synchronously, so let the browser paint the loader before each heavy step.
  let viewsWidth = $state(1);
  const layout = $derived(studioLayout.value);
  const docked = (d: 'left' | 'right' | 'bottom') => layout.docks[d].length > 0;
  // Set for a flight opened from the club. It is never saved and the URL keeps pointing at the server copy.
  const clubKey = page.url.searchParams.get('club');
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

    let flights: Flight[];
    if (clubKey) {
      studio.readOnly = true;
      await syncClient.init();
      if (!syncClient.hasClub) {
        error = m.club_studio_signin();
        return;
      }

      try {
        flights = [await syncClient.clubFlight(clubKey)];
      } catch (err) {
        console.error('Could not load club flight', err);
        error = m.club_studio_not_found();
        return;
      }
    } else {
      flights = (await Promise.all(scene.flightIds.map((id) => flightRepository.get(id)))).filter(
        (f): f is Flight => !!f
      );
    }

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
    if (!clubKey) await studio.loadCameraTracks();
    // Flights from different days need aligning, so open the timeline first.
    if (studio.multiDay) studioLayout.setTab('timeline', false);
    loaded = true;
  });

  // Plugins read the studio through this service while the page is open.
  const unprovide = provideStudioService(studio);
  const unprovideAnalysis = provideAnalysisService(studio);
  onDestroy(() => {
    unprovide();
    unprovideAnalysis();
    studio.destroy();
  });

  // Dropping track files anywhere adds them as pilots. Counted because enter and leave fire for every child.
  let dragDepth = $state(0);
  let importing = $state(false);
  let dropErrors = $state<string[]>([]);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

  function onDragEnter(e: DragEvent) {
    if (!loaded || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
  }

  function onDragOver(e: DragEvent) {
    // Without this the browser does not offer a drop.
    if (loaded && hasFiles(e)) e.preventDefault();
  }

  function onDragLeave(e: DragEvent) {
    if (hasFiles(e)) dragDepth = Math.max(0, dragDepth - 1);
  }

  async function onDrop(e: DragEvent) {
    if (!loaded || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    const files = trackFiles(e.dataTransfer?.files);
    if (!files.length) return;
    importing = true;
    try {
      dropErrors = await importAndAdd(studio, files);
    } catch (err) {
      dropErrors = [err instanceof Error ? err.message : String(err)];
    } finally {
      importing = false;
    }
  }

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
    void goto(`?${query}${clubKey ? `&club=${encodeURIComponent(clubKey)}` : ''}`, {
      shallow: true,
      replace: true,
      reset: false
    });
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

<svelte:window
  onkeydown={onKey}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
/>

{#if error}
  <main class="error">
    <p>{error}</p>
    <a href="/">{m.home_open_logbook()}</a>
  </main>
{:else if loaded}
  <div
    class="app"
    data-layout={studio.layout}
    style:--outliner="{docked('left') && layout.open.left ? layout.sizes.left : 0}px"
    style:--side="{docked('right') && layout.open.right ? layout.sizes.right : 0}px"
    style:--chart="{layout.sizes.bottom}px"
    style:--split="{layout.sizes.split * 100}%"
  >
    <header><Toolbar {studio} /></header>

    <Dock dock="left" {studio} ids={layout.docks.left} />

    {#if docked('left')}
      <div class="outliner-handle">
        <Splitter
          label={m.studio_outliner()}
          axis="x"
          value={layout.sizes.left}
          min={L.left.min}
          max={L.left.max}
          open={layout.open.left}
          onchange={(v) => studioLayout.resize('left', v)}
          onreset={() => studioLayout.reset('left')}
          ontoggle={() => studioLayout.toggleDock('left')}
        />
      </div>
    {/if}

    <div class="views panel" bind:clientWidth={viewsWidth} bind:this={studio.viewsEl}>
      {#if studio.layout !== '2d'}
        <div class="view3d"><CesiumView {studio} /></div>
      {/if}
      {#if studio.layout === 'split'}
        <div class="split-handle">
          <Splitter
            label={m.studio_split_label()}
            axis="x"
            value={layout.sizes.split}
            min={L.split.min}
            max={L.split.max}
            scale={1 / viewsWidth}
            onchange={(v) => studioLayout.resize('split', v)}
            onreset={() => studioLayout.reset('split')}
          />
        </div>
      {/if}
      {#if studio.layout !== '3d'}
        <div class="view2d"><MiniMap {studio} follow={studio.layout === '2d'} /></div>
      {/if}
      <!-- Docks without a visible panel are not rendered, so a drag offers a strip for each of them. -->
      {#if drag.id}
        {#each DOCKS.filter((d) => !docked(d) || !layout.open[d]) as d (d)}
          <div class="zone" data-dock={d} data-over={drag.dock === d ? '' : undefined}>
            {m.dock_drop_here({ dock: DOCK_LABELS[d]() })}
          </div>
        {/each}
      {/if}
    </div>

    {#if docked('right')}
      <div class="side-handle">
        <Splitter
          label={m.studio_side_panel()}
          axis="x"
          sign={-1}
          value={layout.sizes.right}
          min={L.right.min}
          max={L.right.max}
          open={layout.open.right}
          onchange={(v) => studioLayout.resize('right', v)}
          onreset={() => studioLayout.reset('right')}
          ontoggle={() => studioLayout.toggleDock('right')}
        />
      </div>
    {/if}

    <Dock dock="right" {studio} ids={layout.docks.right} />

    {#if docked('bottom')}
      <div class="footer-handle">
        <Splitter
          label={m.studio_bottom_panel()}
          axis="y"
          sign={-1}
          value={layout.sizes.bottom}
          min={L.bottom.min}
          max={L.bottom.max}
          open={layout.open.bottom}
          onchange={(v) => studioLayout.resize('bottom', v)}
          onreset={() => studioLayout.reset('bottom')}
          ontoggle={() => studioLayout.toggleDock('bottom')}
        />
      </div>
    {/if}

    <footer class="panel">
      <Dock dock="bottom" {studio} ids={layout.docks.bottom}>
        {#snippet lead()}<PlayerBar {studio} />{/snippet}
      </Dock>
    </footer>

    <p class="visually-hidden" role="status">{panelStatus.text}</p>

    {#if dragDepth > 0}
      <div class="drop-overlay" aria-hidden="true">{m.studio_drop_overlay()}</div>
    {/if}

    {#if importing || dropErrors.length}
      <div class="notice" role={dropErrors.length ? 'alert' : 'status'}>
        {#if importing}
          <p>{m.drop_processing()}</p>
        {/if}
        {#each dropErrors as e (e)}<p class="err">{e}</p>{/each}
        {#if dropErrors.length}
          <button type="button" onclick={() => (dropErrors = [])}>{m.common_close()}</button>
        {/if}
      </div>
    {/if}
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
  footer {
    grid-area: footer;
  }
  /* Shown while files are dragged over the page. Clicks pass through, so the drag events keep their targets. */
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    pointer-events: none;
    font-size: 22px;
    font-weight: 600;
    background: color-mix(in srgb, var(--primary) 22%, transparent);
    border: 3px dashed var(--primary-hi);
  }
  .notice {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 40;
    display: grid;
    gap: 6px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 12px;
    font-size: 13px;
    background: var(--surface);
    border: 1px solid var(--border-hi);
    border-radius: 8px;
  }
  .notice p {
    margin: 0;
  }
  .notice .err {
    color: var(--danger);
  }
  /* Drop zones of empty docks, shown only while a panel is dragged. */
  .zone {
    position: absolute;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 4px;
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    color: var(--text);
    background: color-mix(in srgb, var(--drop-marker-color, var(--primary)) 18%, var(--surface));
    border: 2px dashed var(--drop-marker-color, var(--primary));
  }
  .zone[data-over] {
    background: color-mix(in srgb, var(--drop-marker-color, var(--primary)) 45%, var(--surface));
    border-style: solid;
  }
  .zone[data-dock='left'],
  .zone[data-dock='right'] {
    top: 0;
    bottom: 0;
    width: 48px;
    writing-mode: vertical-rl;
  }
  .zone[data-dock='left'] {
    left: 0;
  }
  .zone[data-dock='right'] {
    right: 0;
  }
  .zone[data-dock='bottom'] {
    left: 0;
    right: 0;
    bottom: 0;
    height: 48px;
  }
  @media (forced-colors: active) {
    .zone {
      border-color: Highlight;
    }
    .zone[data-over] {
      background: Highlight;
      color: HighlightText;
    }
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* Only the moving panels animate when a move is wrapped in a view transition. */
  :global(::view-transition-old(root)),
  :global(::view-transition-new(root)) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(::view-transition-group(*)),
    :global(::view-transition-old(*)),
    :global(::view-transition-new(*)) {
      animation: none;
    }
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
  }
</style>
