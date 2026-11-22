<script lang="ts">
  import { EXAGGERATION } from '#lib/domain/scene';
  import { m } from '#lib/paraglide/messages';
  import { formatNumber } from '#lib/ui/format';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { thermalPrefs } from '#lib/state/thermalPrefs.svelte';
  import AirspaceControls from './AirspaceControls.svelte';
  import ThermalOverlayControls from './ThermalOverlayControls.svelte';
  import Popover from './Popover.svelte';

  let { replay }: { replay: ReplayState } = $props();
</script>

<Popover label={m.view_menu()}>
  <div class="fields">
    <label for="view-exag">{m.view_height()}</label>
    <span class="range">
      <input
        id="view-exag"
        type="range"
        min={EXAGGERATION.min}
        max={EXAGGERATION.max}
        step={EXAGGERATION.step}
        bind:value={replay.exaggeration}
      />
      <output for="view-exag">{formatNumber(replay.exaggeration, 1)}×</output>
    </span>
    <label for="view-sun">{m.view_sun_lighting()}</label>
    <input id="view-sun" type="checkbox" bind:checked={replay.lighting} />
    <label for="view-labels">{m.view_pilot_names()}</label>
    <input id="view-labels" type="checkbox" bind:checked={replay.labels} />
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
  <h3>{m.view_airspaces_2d()}</h3>
  <AirspaceControls />
  <h3>{m.view_thermal_overlay()}</h3>
  <ThermalOverlayControls />
</Popover>

<style>
  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    justify-items: start;
    gap: 6px 10px;
  }
  label {
    color: var(--muted);
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
  h3 {
    margin: 12px 0 6px;
    font-size: 13px;
  }
  .hint {
    margin: 8px 0 0;
    max-width: 240px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
