<script lang="ts">
  import Crosshair from '@lucide/svelte/icons/crosshair';
  import { onMount } from 'svelte';

  import { loadFlights } from '#lib/data/loadFlights';
  import { analyzeFlight } from '#lib/domain/analysis/analyze';
  import { extractTransitions } from '#lib/domain/analysis/transitions';
  import { glideProfile, validGlideInput } from '#lib/domain/glide';
  import { m } from '#lib/paraglide/messages';
  import type { FlightsService, FlightSummary } from '#lib/plugins/api';
  import { services } from '#lib/plugins/services';
  import { glide, type GlideInputs } from '#lib/state/glide.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatAlt, fromAlt, fromSpeed, toAlt, toSpeed, UNIT_LABELS } from '#lib/ui/units';

  // shortcut: only the newest glides of a glider are analysed, raise if medians look thin.
  const MAX_FLIGHTS = 20;

  const u = $derived(unitPrefs.units);
  const { inputs } = $derived(glide);

  let summaries = $state<readonly FlightSummary[]>([]);
  let gliders = $state<string[]>([]);
  let glider = $state('');
  let profile = $state<{ ld: number; speed: number; count: number } | null>(null);
  let run = 0;

  /** Median glide of the glider's logbook flights, applied to the inputs when `apply` is set. */
  async function pick(name: string, apply: boolean) {
    glider = name;
    const id = ++run;
    const ids = summaries
      .filter((f) => f.glider === name && f.fixCount > 0)
      .toSorted((a, b) => b.startTime - a.startTime)
      .slice(0, MAX_FLIGHTS)
      .map((f) => f.id);
    const flights = await loadFlights(ids).catch(() => []);
    const transitions = flights.flatMap((f) => extractTransitions(f.fixes, analyzeFlight(f).thermals));
    if (id !== run) return;
    profile = glideProfile(transitions);
    if (apply) useLogbook();
  }

  function useLogbook() {
    if (profile) glide.set({ ld: Math.round(profile.ld * 10) / 10, airspeed: profile.speed });
  }

  onMount(async () => {
    try {
      summaries = await services.use<FlightsService>('updraft/flights@1').list();
    } catch {
      return;
    }

    const byNewest = summaries.filter((f) => f.glider).toSorted((a, b) => b.startTime - a.startTime);
    gliders = [...new Set(byNewest.map((f) => f.glider!))].toSorted((a, b) => a.localeCompare(b));
    if (byNewest.length) await pick(byNewest[0].glider!, !glide.stored);
  });

  const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value;
  const set = (key: keyof GlideInputs, e: Event, from: (v: number) => number = (v) => v) => {
    if (validGlideInput(key, num(e))) glide.set({ [key]: from(num(e)) });
  };
  const alt = (v: number) => Math.round(toAlt(v, u.alt));
  const speed = (v: number) => Math.round(toSpeed(v, u.speed) * 10) / 10;
</script>

<div class="grid">
  <button type="button" aria-pressed={glide.armed} onclick={() => (glide.armed = !glide.armed)}>
    <Crosshair size={14} aria-hidden="true" />
    {glide.armed ? m.glide_picking() : m.glide_pick_start()}
  </button>

  <label>
    {m.glide_start_alt({ unit: UNIT_LABELS.alt[u.alt] })}
    <input
      type="number"
      min="0"
      step="any"
      value={alt(inputs.altitude)}
      onchange={(e) => set('altitude', e, (v) => fromAlt(v, u.alt))}
    />
  </label>
  <p class="muted">
    {glide.ground === null ? m.glide_hint() : m.glide_agl({ agl: formatAlt(inputs.altitude - glide.ground, u) })}
  </p>

  {#if gliders.length}
    <label>
      {m.glide_glider()}
      <select value={glider} onchange={(e) => pick(e.currentTarget.value, true)}>
        {#each gliders as g (g)}<option value={g}>{g}</option>{/each}
      </select>
    </label>
    <p class="muted">
      {#if profile}
        {m.glide_samples({ count: profile.count, ld: Math.round(profile.ld * 10) / 10 })}
        <button type="button" onclick={useLogbook}>{m.glide_use_logbook()}</button>
      {:else}
        {m.glide_no_data()}
      {/if}
    </p>
  {/if}

  <label>
    {m.glide_ld()}
    <input type="number" min="1" step="any" value={inputs.ld} onchange={(e) => set('ld', e)} />
  </label>
  <label>
    {m.glide_airspeed({ unit: UNIT_LABELS.speed[u.speed] })}
    <input
      type="number"
      min="1"
      step="any"
      value={speed(inputs.airspeed)}
      onchange={(e) => set('airspeed', e, (v) => fromSpeed(v, u.speed))}
    />
  </label>
  <label>
    {m.glide_wind_speed({ unit: UNIT_LABELS.speed[u.speed] })}
    <input
      type="number"
      min="0"
      step="any"
      value={speed(inputs.windSpeed)}
      onchange={(e) => set('windSpeed', e, (v) => fromSpeed(v, u.speed))}
    />
  </label>
  <label>
    {m.glide_wind_dir()}
    <input
      type="number"
      min="0"
      max="360"
      step="1"
      value={inputs.windFrom}
      onchange={(e) => set('windFrom', e, (v) => ((v % 360) + 360) % 360)}
    />
  </label>
  <label>
    {m.glide_margin({ unit: UNIT_LABELS.alt[u.alt] })}
    <input
      type="number"
      min="0"
      step="any"
      value={alt(inputs.margin)}
      onchange={(e) => set('margin', e, (v) => fromAlt(v, u.alt))}
    />
  </label>
</div>

<style>
  .grid {
    display: grid;
    gap: 10px;
  }
  label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  input {
    width: 100%;
    box-sizing: border-box;
  }
  .muted {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  button[aria-pressed='true'] {
    border-color: var(--primary-hi);
  }
</style>
