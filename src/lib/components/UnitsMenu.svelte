<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { unitPrefs } from '#lib/state/units.svelte';
  import {
    ALT_UNITS,
    DISTANCE_UNITS,
    presetOf,
    SPEED_UNITS,
    UNIT_LABELS,
    UNIT_PRESETS,
    VARIO_UNITS,
    type UnitPreset,
    type Units
  } from '#lib/ui/units';
  import Popover from './Popover.svelte';

  const PRESET_LABELS: Record<UnitPreset, () => string> = {
    metric: () => m.units_preset_metric(),
    imperial: () => m.units_preset_imperial(),
    aviation: () => m.units_preset_aviation()
  };
  const FIELDS = [
    { key: 'distance', label: () => m.units_distance(), options: DISTANCE_UNITS },
    { key: 'alt', label: () => m.units_altitude(), options: ALT_UNITS },
    { key: 'vario', label: () => m.units_vario(), options: VARIO_UNITS },
    { key: 'speed', label: () => m.units_speed(), options: SPEED_UNITS }
  ] as const;

  const preset = $derived(presetOf(unitPrefs.units));

  function setField(key: keyof Units, value: string) {
    unitPrefs.set({ ...unitPrefs.units, [key]: value });
  }
</script>

<Popover label={m.units_menu()}>
  <div class="presets" role="group" aria-label={m.units_preset_group()}>
    {#each Object.keys(UNIT_PRESETS) as UnitPreset[] as p (p)}
      <button class:active={preset === p} onclick={() => unitPrefs.set({ ...UNIT_PRESETS[p] })}>
        {PRESET_LABELS[p]()}
      </button>
    {/each}
  </div>
  {#if preset === 'custom'}<p class="custom">{m.units_custom()}</p>{/if}
  <div class="fields">
    {#each FIELDS as f (f.key)}
      <label for="unit-{f.key}">{f.label()}</label>
      <select id="unit-{f.key}" value={unitPrefs.units[f.key]} onchange={(e) => setField(f.key, e.currentTarget.value)}>
        {#each f.options as o (o)}
          <option value={o}>{(UNIT_LABELS[f.key] as Record<string, string>)[o]}</option>
        {/each}
      </select>
    {/each}
  </div>
</Popover>

<style>
  .presets {
    display: flex;
    margin-bottom: 8px;
  }
  .presets button {
    flex: 1;
    border-radius: 0;
  }
  .presets button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .presets button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .presets button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }
  .custom {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 10px;
  }
  label {
    color: var(--muted);
  }
</style>
