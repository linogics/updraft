<script lang="ts">
  import { loadRuntimeConfig, saveIonToken } from '#lib/config';
  import { BASEMAP_IDS, CAMERA_MODES, LAYOUTS } from '#lib/domain/scene';
  import { m } from '#lib/paraglide/messages';
  import { BASEMAPS } from '#lib/map/basemaps';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import Logo from './Logo.svelte';
  import ExportImage from './ExportImage.svelte';
  import ExportVideo from './ExportVideo.svelte';
  import Popover from './Popover.svelte';
  import TrackMenu from './TrackMenu.svelte';
  import LanguageSelect from './LanguageSelect.svelte';
  import UnitsMenu from './UnitsMenu.svelte';
  import ViewMenu from './ViewMenu.svelte';

  let { replay }: { replay: ReplayState } = $props();

  const LAYOUT_LABELS = { '3d': () => '3D', '2d': () => '2D', split: () => m.layout_split() } as const;
  const CAMERA_LABELS = {
    follow: () => m.camera_follow(),
    cockpit: () => m.camera_cockpit(),
    orbit: () => m.camera_orbit(),
    free: () => m.camera_free(),
    keys: () => m.camera_keys()
  } as const;

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
    else ionError = m.toolbar_ion_storage_blocked();
  }
</script>

<svelte:document onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<div class="toolbar">
  <Logo compact />

  <div class="group" role="group" aria-label={m.toolbar_layout()}>
    {#each LAYOUTS as l (l)}
      <button class:active={replay.layout === l} onclick={() => (replay.layout = l)}>{LAYOUT_LABELS[l]()}</button>
    {/each}
  </div>

  <div class="group" role="group" aria-label={m.toolbar_camera()}>
    {#each CAMERA_MODES as c (c)}
      <button class:active={replay.camera === c} onclick={() => (replay.camera = c)}>{CAMERA_LABELS[c]()}</button>
    {/each}
  </div>

  <TrackMenu {replay} />
  <ViewMenu {replay} />

  <Popover label={m.export_menu()}>
    <ExportImage {replay} />
    <ExportVideo {replay} />
  </Popover>

  <label>
    {m.toolbar_map()}
    <select bind:value={replay.basemap}>
      {#each BASEMAP_IDS as id (id)}<option value={id}>{BASEMAPS[id].label()}</option>{/each}
    </select>
  </label>

  <label title={replay.ionAvailable ? undefined : m.toolbar_ion_hint()}>
    {m.toolbar_terrain()}
    <select bind:value={replay.terrain}>
      <option value="ion" disabled={!replay.ionAvailable}>
        {replay.ionAvailable ? m.toolbar_terrain_ion() : m.toolbar_terrain_ion_locked()}
      </option>
      <option value="terrarium">{m.toolbar_terrain_aws()}</option>
      <option value="none">{m.toolbar_terrain_flat()}</option>
    </select>
  </label>

  <Popover label="Ion">
    <form class="ion" onsubmit={applyIonToken}>
      <label for="ion-token">{m.toolbar_ion_token()}</label>
      <input id="ion-token" type="password" autocomplete="off" bind:value={ionToken} placeholder="eyJhbGciOi…" />
      <p>
        <!-- Static i18n message with a fixed link, no user input. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html m.toolbar_ion_help({
          link: '<a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer">ion.cesium.com</a>'
        })}
      </p>
      {#if ionError}<p class="error" role="alert">{ionError}</p>{/if}
      <button type="submit">{m.toolbar_ion_save()}</button>
    </form>
  </Popover>

  <LanguageSelect />
  <UnitsMenu />

  {#if canFullscreen}
    <button onclick={toggleFullscreen} aria-pressed={fullscreen}>
      {fullscreen ? m.toolbar_exit_fullscreen() : m.toolbar_fullscreen()}
    </button>
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
  .toolbar > :global(.logo) {
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
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg);
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
    color: var(--danger);
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
