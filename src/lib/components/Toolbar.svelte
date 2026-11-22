<script lang="ts">
  import { loadRuntimeConfig, saveIonToken } from '#lib/config';
  import { BASEMAP_IDS, CAMERA_MODES, LAYOUTS } from '#lib/domain/scene';
  import { BASEMAPS } from '#lib/map/basemaps';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import ExportImage from './ExportImage.svelte';
  import ExportVideo from './ExportVideo.svelte';
  import Popover from './Popover.svelte';
  import TrackMenu from './TrackMenu.svelte';
  import UnitsMenu from './UnitsMenu.svelte';
  import ViewMenu from './ViewMenu.svelte';

  let { replay }: { replay: ReplayState } = $props();

  const LAYOUT_LABELS = { '3d': '3D', '2d': '2D', split: 'Split' } as const;
  const ION_HINT = 'Needs a Cesium ion token (Ion menu)';

  let ionToken = $state('');
  let ionError = $state('');
  loadRuntimeConfig().then((c) => (ionToken = c.cesiumIonToken));

  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  let fullscreen = $state(false);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  // The viewer reads the token once at start, so reload to apply it.
  function applyIonToken(e: SubmitEvent) {
    e.preventDefault();
    if (saveIonToken(ionToken.trim())) location.reload();
    else ionError = 'Browser storage is blocked, the token cannot be saved.';
  }
</script>

<svelte:document onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<div class="toolbar">
  <a href="/" class="home">← Flights</a>

  <div class="group" role="group" aria-label="Layout">
    {#each LAYOUTS as l (l)}
      <button class:active={replay.layout === l} onclick={() => (replay.layout = l)}>{LAYOUT_LABELS[l]}</button>
    {/each}
  </div>

  <div class="group" role="group" aria-label="Camera">
    {#each CAMERA_MODES as c (c)}
      <button class:active={replay.camera === c} onclick={() => (replay.camera = c)}>{c}</button>
    {/each}
  </div>

  <TrackMenu {replay} />
  <ViewMenu {replay} />

  <Popover label="Export">
    <ExportImage {replay} />
    <ExportVideo {replay} />
  </Popover>

  <label>
    Map
    <select bind:value={replay.basemap}>
      {#each BASEMAP_IDS as id (id)}<option value={id}>{BASEMAPS[id].label}</option>{/each}
    </select>
  </label>

  <label title={replay.ionAvailable ? undefined : ION_HINT}>
    Terrain
    <select bind:value={replay.terrain}>
      <option value="ion" disabled={!replay.ionAvailable}>
        Cesium World Terrain{replay.ionAvailable ? '' : ' (needs token)'}
      </option>
      <option value="terrarium">AWS Terrain Tiles (free)</option>
      <option value="none">Flat</option>
    </select>
  </label>

  <Popover label="Ion">
    <form class="ion" onsubmit={applyIonToken}>
      <label for="ion-token">Cesium ion token</label>
      <input id="ion-token" type="password" autocomplete="off" bind:value={ionToken} placeholder="eyJhbGciOi…" />
      <p>
        Free at <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer">ion.cesium.com</a>. Kept only in
        this browser. Leave empty to remove.
      </p>
      {#if ionError}<p class="error" role="alert">{ionError}</p>{/if}
      <button type="submit">Save and reload</button>
    </form>
  </Popover>

  <UnitsMenu />

  {#if canFullscreen}
    <button onclick={toggleFullscreen} aria-pressed={fullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
  }
  .home {
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
    margin-right: auto;
  }
  .group {
    display: flex;
  }
  .group button {
    border-radius: 0;
    text-transform: capitalize;
  }
  .group button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .group button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .group button.active {
    background: #3987e5;
    border-color: #3987e5;
    color: #fff;
  }
  .ion {
    display: grid;
    gap: 6px;
    width: 260px;
  }
  .ion p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .ion .error {
    color: #e5484d;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
