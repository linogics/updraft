<script lang="ts">
  import { BASEMAP_IDS, CAMERA_MODES, COLOR_MODES, LAYOUTS } from '#lib/domain/scene';
  import { BASEMAPS } from '#lib/map/basemaps';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import UnitsMenu from './UnitsMenu.svelte';

  let { replay }: { replay: ReplayState } = $props();

  const LAYOUT_LABELS = { '3d': '3D', '2d': '2D', split: 'Split' } as const;
  const ION_HINT = 'Needs CESIUM_ION_TOKEN in the runtime config';
</script>

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

  <label>
    Track colour
    <select bind:value={replay.colorBy}>
      {#each COLOR_MODES as m (m)}<option value={m}>{m}</option>{/each}
    </select>
  </label>

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

  <UnitsMenu />
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
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
