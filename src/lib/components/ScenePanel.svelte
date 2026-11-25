<script lang="ts">
  import { BASEMAP_IDS, EXAGGERATION } from '#lib/domain/scene';
  import { m } from '#lib/paraglide/messages';
  import { BASEMAPS } from '#lib/map/basemaps';
  import { formatNumber } from '#lib/ui/format';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { thermalPrefs } from '#lib/state/thermalPrefs.svelte';
  import AirspaceControls from './AirspaceControls.svelte';
  import ThermalOverlayControls from './ThermalOverlayControls.svelte';

  let { studio }: { studio: StudioState } = $props();
</script>

<div class="fields">
  <label for="scene-map">{m.toolbar_map()}</label>
  <select id="scene-map" bind:value={studio.basemap}>
    {#each BASEMAP_IDS as id (id)}<option value={id}>{BASEMAPS[id].label()}</option>{/each}
  </select>
  <label for="scene-terrain" title={studio.ionAvailable ? undefined : m.toolbar_ion_hint()}>
    {m.toolbar_terrain()}
  </label>
  <select id="scene-terrain" bind:value={studio.terrain}>
    <option value="ion" disabled={!studio.ionAvailable}>
      {studio.ionAvailable ? m.toolbar_terrain_ion() : m.toolbar_terrain_ion_locked()}
    </option>
    <option value="terrarium">{m.toolbar_terrain_aws()}</option>
    <option value="none">{m.toolbar_terrain_flat()}</option>
  </select>
</div>

<div class="fields">
  <label for="view-exag">{m.view_height()}</label>
  <span class="range">
    <input
      id="view-exag"
      type="range"
      min={EXAGGERATION.min}
      max={EXAGGERATION.max}
      step={EXAGGERATION.step}
      bind:value={studio.exaggeration}
    />
    <output for="view-exag">{formatNumber(studio.exaggeration, 1)}×</output>
  </span>
  <label for="view-sun">{m.view_sun_lighting()}</label>
  <input id="view-sun" type="checkbox" bind:checked={studio.lighting} />
  <label for="view-labels">{m.view_pilot_names()}</label>
  <input id="view-labels" type="checkbox" bind:checked={studio.labels} />
  <label for="view-thermal-columns">{m.view_thermal_columns()}</label>
  <input
    id="view-thermal-columns"
    type="checkbox"
    checked={thermalPrefs.columns}
    onchange={(e) => thermalPrefs.set({ columns: e.currentTarget.checked, labels: thermalPrefs.labels })}
  />
  <label for="view-thermal-labels">{m.view_thermal_labels()}</label>
  <input
    id="view-thermal-labels"
    type="checkbox"
    checked={thermalPrefs.labels}
    onchange={(e) => thermalPrefs.set({ columns: thermalPrefs.columns, labels: e.currentTarget.checked })}
  />
</div>
<p class="hint">{m.view_hint_3d()}</p>
<h4>{m.view_airspaces_2d()}</h4>
<AirspaceControls />
<h4>{m.view_thermal_overlay()}</h4>
<ThermalOverlayControls />

<style>
  .fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-items: start;
    gap: 6px 10px;
  }
  .fields + .fields {
    margin-top: 12px;
  }
  label {
    color: var(--muted);
  }
  select {
    width: 100%;
  }
  .range {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-self: stretch;
  }
  .range input {
    flex: 1;
    min-width: 0;
  }
  output {
    width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  h4 {
    margin: 12px 0 6px;
    font-size: 13px;
  }
  .hint {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 12px;
  }
</style>
