<script lang="ts">
  import { goto } from '$app/navigation';

  import Spinner from '#lib/components/Spinner.svelte';
  import { encodeRoute } from '#lib/domain/route';
  import { routeFromFlight } from '#lib/domain/routeFromFlight';
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { XC_LEAGUES, type XcLeague } from '#lib/state/xcPrefs';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { formatNumber } from '#lib/ui/format';
  import { formatDistance } from '#lib/ui/units';
  import { XC_TYPE_LABELS } from '#lib/xc/labels';

  let { studio }: { studio: StudioState } = $props();

  let turnpoints = $state(3);
  const makeRoute = () => {
    const sel = studio.selected;
    if (!sel) return;
    const n = Math.min(30, Math.max(1, Math.round(turnpoints) || 3));
    void goto(`/plan?r=${encodeURIComponent(encodeRoute(routeFromFlight(sel.flight.fixes, n)))}`);
  };

  const u = $derived(unitPrefs.units);
  const xc = $derived(studio.selected?.xc);
  const xcItems = $derived(
    xc
      ? [
          [m.xc_type(), XC_TYPE_LABELS[xc.type]()],
          [m.xc_distance(), formatDistance(xc.distance, u)],
          [m.xc_multiplier(), `× ${xc.multiplier}`],
          [m.xc_points(), formatNumber(xc.points, 2)]
        ]
      : []
  );
</script>

<label class="switch">
  <input
    type="checkbox"
    {...{ switch: true }}
    checked={xcPrefs.enabled}
    onchange={(e) => xcPrefs.setEnabled(e.currentTarget.checked)}
  />
  {m.xc_enabled()}
</label>
{#if studio.selected}
  <fieldset class="feature" disabled={!xcPrefs.enabled}>
    <select
      value={xcPrefs.league}
      onchange={(e) => studio.setLeague(e.currentTarget.value as XcLeague)}
      aria-label={m.xc_league()}
    >
      {#each XC_LEAGUES as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
    </select>
    <!-- Nothing is scored while XC is off. -->
    {#if !xcPrefs.enabled}{:else if xc}
      <dl>
        {#each xcItems as [label, value] (label)}
          <dt>{label}</dt>
          <dd>{value}</dd>
        {/each}
      </dl>
    {:else if xc === undefined}
      {#if studio.xcBusy}<Spinner label={m.xc_scoring()} />{:else}<p class="muted">{m.xc_scoring()}</p>{/if}
    {:else}
      <p class="muted">–</p>
    {/if}
    <label>
      {m.xc_turnpoints()}
      <input type="number" min="1" max="30" bind:value={turnpoints} />
    </label>
    <button type="button" onclick={makeRoute}>{m.xc_open_planner()}</button>
    {#if xcPrefs.enabled && studio.flights.length > 1}
      <ul class="xc-list">
        {#each studio.flights as f (f.flight.id)}
          <li>
            <span class="dot" style:background={f.color}></span>
            <span class="xc-name">{f.flight.pilot}</span>
            <span>{f.xc === undefined ? '…' : f.xc ? formatNumber(f.xc.points, 2) : '–'}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </fieldset>
{/if}

<style>
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 12px;
    margin: 0 0 10px;
    font-size: 13px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  select {
    margin-bottom: 8px;
  }
  .muted {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .xc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12px;
  }
  .xc-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .xc-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
