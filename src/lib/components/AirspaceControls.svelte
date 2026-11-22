<script lang="ts">
  import { AIRSPACE_CLASSES } from '#lib/airspace/model';
  import { MAX_FLOOR_LIMIT } from '#lib/airspace/prefs';
  import { m } from '#lib/paraglide/messages';
  import { airspacePrefs as prefs } from '#lib/airspace/prefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { fromAlt, toAlt, UNIT_LABELS } from '#lib/ui/units';

  const alt = $derived(unitPrefs.units.alt);
</script>

<div class="fields">
  <label for="as-show">{m.airspace_show()}</label>
  <input
    id="as-show"
    type="checkbox"
    checked={prefs.show}
    onchange={(e) => prefs.set({ show: e.currentTarget.checked })}
  />
  <span>{m.airspace_classes()}</span>
  <span class="classes">
    {#each AIRSPACE_CLASSES as c (c)}
      <label>
        <input
          type="checkbox"
          checked={prefs.classes.includes(c)}
          onchange={(e) =>
            prefs.set({
              classes: AIRSPACE_CLASSES.filter((x) => (x === c ? e.currentTarget.checked : prefs.classes.includes(x)))
            })}
        />
        {c === 'other' ? m.airspace_class_other() : c}
      </label>
    {/each}
  </span>
  <label for="as-floor">{m.airspace_floor()}</label>
  <span class="range">
    <input
      id="as-floor"
      type="range"
      min="0"
      max={Math.round(toAlt(MAX_FLOOR_LIMIT, alt))}
      step={alt === 'ft' ? 100 : 50}
      value={Math.round(toAlt(prefs.maxFloor, alt))}
      oninput={(e) => prefs.set({ maxFloor: fromAlt(e.currentTarget.valueAsNumber, alt) })}
    />
    <output for="as-floor">{Math.round(toAlt(prefs.maxFloor, alt))} {UNIT_LABELS.alt[alt]}</output>
  </span>
  <label for="as-opacity">{m.common_opacity()}</label>
  <input
    id="as-opacity"
    type="range"
    min="0.1"
    max="0.6"
    step="0.05"
    value={prefs.opacity}
    oninput={(e) => prefs.set({ opacity: e.currentTarget.valueAsNumber })}
  />
  <label for="as-key">{m.airspace_key()}</label>
  <input
    id="as-key"
    type="password"
    autocomplete="off"
    value={prefs.key}
    onchange={(e) => prefs.setKey(e.currentTarget.value.trim())}
  />
</div>
{#if !prefs.key}
  <p class="hint">
    {@html m.airspace_key_hint({
      link: '<a href="https://www.openaip.net" target="_blank" rel="noreferrer">openaip.net</a>'
    })}
  </p>
{/if}

<style>
  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    justify-items: start;
    gap: 6px 10px;
  }
  label,
  .fields > span:first-of-type {
    color: var(--muted);
  }
  .classes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .classes label {
    color: inherit;
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
    min-width: 56px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 8px 0 0;
    max-width: 260px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
