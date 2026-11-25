<script lang="ts">
  import { loadRuntimeConfig, saveIonToken } from '#lib/config';
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
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

  // The dock passes the studio to every panel, settings do not need it.
  // eslint-disable-next-line no-empty-pattern
  let {}: { studio: StudioState } = $props();

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

  let ionToken = $state('');
  let ionError = $state('');
  void loadRuntimeConfig().then((c) => (ionToken = c.cesiumIonToken));

  // The viewer reads the token once at start, so reload to apply it.
  function applyIonToken(e: SubmitEvent) {
    e.preventDefault();
    if (saveIonToken(ionToken.trim())) location.reload();
    else ionError = m.toolbar_ion_storage_blocked();
  }
</script>

<h4>{m.units_menu()}</h4>
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

<h4>Cesium ion</h4>
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
    color: var(--bg);
  }
  .custom {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px 10px;
  }
  label {
    color: var(--muted);
  }
  select {
    width: 100%;
  }
  h4 {
    margin: 12px 0 6px;
    font-size: 13px;
  }
  h4:first-child {
    margin-top: 0;
  }
  .ion {
    display: grid;
    gap: 6px;
  }
  .ion p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .ion .error {
    color: var(--danger);
  }
</style>
