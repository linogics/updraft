<script lang="ts">
  import { goto } from '$app/navigation';
  import { routeFromFlight } from '#lib/domain/routeFromFlight';
  import { encodeRoute } from '#lib/domain/route';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { phaseColor } from '#lib/ui/colors';
  import AltRefSwitch from '#lib/components/AltRefSwitch.svelte';
  import { XC_LEAGUES, type XcLeague } from '#lib/state/xcPrefs';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatDuration } from '#lib/ui/format';
  import { formatAlt, formatDistance, formatSpeed, formatVario } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

  let turnpoints = $state(3);
  const makeRoute = () => {
    const sel = replay.selected;
    if (!sel) return;
    const n = Math.min(30, Math.max(1, Math.round(turnpoints) || 3));
    void goto(`/plan?r=${encodeURIComponent(encodeRoute(routeFromFlight(sel.flight.fixes, n)))}`);
  };

  const stats = $derived(replay.selected?.analysis.stats);
  const u = $derived(unitPrefs.units);
  const items = $derived(
    stats
      ? [
          ['Duration', formatDuration(stats.duration)],
          ['Track', formatDistance(stats.trackLength, u)],
          ['Max from takeoff', formatDistance(stats.maxDistanceFromTakeoff, u)],
          ['Takeoff → landing', formatDistance(stats.straightDistance, u)],
          ['Max altitude', formatAlt(stats.maxAlt, u)],
          ['Takeoff altitude', formatAlt(stats.takeoffAlt, u)],
          ['Max climb', formatVario(stats.maxClimb, u)],
          ['Max sink', formatVario(stats.maxSink, u)],
          ['Glide ratio', stats.glideRatio ? `${stats.glideRatio.toFixed(1)} : 1` : '–']
        ]
      : []
  );
  const agl = $derived(altRefPrefs.ref === 'agl');
  const summary = $derived(replay.selected && replay.transitionSummary(replay.selected, agl));
  const alt = (v: number | null) => (v == null ? '–' : formatAlt(v, u));
  const transitionItems = $derived(
    summary && summary.count
      ? [
          [agl ? 'Leave climbs at ⌀ (AGL)' : 'Leave climbs at ⌀', alt(summary.avgStartAlt)],
          [agl ? 'Arrive at next ⌀ (AGL)' : 'Arrive at next ⌀', alt(summary.avgEndAlt)],
          [agl ? 'Lowest arrival (AGL)' : 'Lowest arrival', alt(summary.lowestArrival)],
          ['Glide ⌀', summary.avgGlideRatio ? `${summary.avgGlideRatio.toFixed(1)} : 1` : '–'],
          ['Speed made good ⌀', summary.avgSpeed ? formatSpeed(summary.avgSpeed, u) : '–']
        ]
      : []
  );
  const XC_TYPES = { free: 'Free distance', flat: 'Flat triangle', fai: 'FAI triangle', oar: 'Out and return' };
  const xc = $derived(replay.selected?.xc);
  const xcItems = $derived(
    xc
      ? [
          ['Type', XC_TYPES[xc.type]],
          ['Distance', formatDistance(xc.distance, u)],
          ['Multiplier', `× ${xc.multiplier}`],
          ['Points', xc.points.toFixed(2)]
        ]
      : []
  );
  const shares = $derived(
    stats ? (['thermalling', 'gliding', 'searching'] as const).map((k) => ({ k, v: stats.phaseShare[k] })) : []
  );
</script>

{#if replay.selected}
  <section>
    <h3>XC</h3>
    <select
      value={xcPrefs.league}
      onchange={(e) => replay.setLeague(e.currentTarget.value as XcLeague)}
      aria-label="XC league"
    >
      {#each XC_LEAGUES as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
    </select>
    {#if xc}
      <dl>
        {#each xcItems as [label, value] (label)}
          <dt>{label}</dt>
          <dd>{value}</dd>
        {/each}
      </dl>
    {:else}
      <p class="muted">{xc === undefined ? 'Scoring…' : '–'}</p>
    {/if}
    <label>
      Turnpoints
      <input type="number" min="1" max="30" bind:value={turnpoints} />
    </label>
    <button type="button" onclick={makeRoute}>Open in planner</button>
    {#if replay.flights.length > 1}
      <ul class="xc-list">
        {#each replay.flights as f (f.flight.id)}
          <li>
            <span class="dot" style:background={f.color}></span>
            <span class="xc-name">{f.flight.pilot}</span>
            <span>{f.xc === undefined ? '…' : f.xc ? f.xc.points.toFixed(2) : '–'}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if stats}
  <section>
    <h3>Flight</h3>
    <dl>
      {#each items as [label, value] (label)}
        <dt>{label}</dt>
        <dd>{value}</dd>
      {/each}
    </dl>
    <div class="phases" role="img" aria-label="Time share per phase">
      {#each shares as s (s.k)}
        <span style:flex={s.v} style:background={phaseColor(s.k)} title="{s.k} {Math.round(s.v * 100)}%"></span>
      {/each}
    </div>
    <ul class="legend">
      {#each shares as s (s.k)}
        <li><span class="dot" style:background={phaseColor(s.k)}></span>{s.k} {Math.round(s.v * 100)}%</li>
      {/each}
    </ul>
    {#if transitionItems.length}
      <h4>Transitions <span class="count">{summary?.count} {summary?.count === 1 ? 'glide' : 'glides'}</span><AltRefSwitch /></h4>
      <dl>
        {#each transitionItems as [label, value] (label)}
          <dt>{label}</dt>
          <dd>{value}</dd>
        {/each}
      </dl>
    {/if}
  </section>
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
  h4 {
    margin: 14px 0 6px;
    font-size: 13px;
  }
  .count {
    color: var(--muted);
    font-weight: 400;
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .phases {
    display: flex;
    gap: 2px;
    height: 8px;
  }
  .phases span:first-child {
    border-radius: 4px 0 0 4px;
  }
  .phases span:last-child {
    border-radius: 0 4px 4px 0;
  }
  .legend {
    display: flex;
    gap: 12px;
    list-style: none;
    padding: 0;
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 4px;
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
