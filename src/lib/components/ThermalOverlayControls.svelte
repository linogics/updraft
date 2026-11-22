<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { thermalOverlayPrefs as prefs } from '#lib/thermals/prefs.svelte';
</script>

<div class="fields">
  <label for="th-hotspots">{m.thermal_hotspots()}</label>
  <input id="th-hotspots" type="checkbox" checked={prefs.hotspots} onchange={(e) => prefs.set({ hotspots: e.currentTarget.checked })} />
  <label for="th-skyways">{m.thermal_skyways()}</label>
  <input id="th-skyways" type="checkbox" checked={prefs.skyways} onchange={(e) => prefs.set({ skyways: e.currentTarget.checked })} />
  <label for="th-opacity">{m.common_opacity()}</label>
  <input
    id="th-opacity"
    type="range"
    min="0.1"
    max="1"
    step="0.05"
    value={prefs.opacity}
    oninput={(e) => prefs.set({ opacity: e.currentTarget.valueAsNumber })}
  />
</div>

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
  .fields > input[type='range'] {
    justify-self: stretch;
  }
</style>
