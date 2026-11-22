<script lang="ts">
  import { goto } from '$app/navigation';
  import { routeFromFlight } from '#lib/domain/routeFromFlight';
  import { encodeRoute } from '#lib/domain/route';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { phaseColor } from '#lib/ui/colors';
  import AltRefSwitch from '#lib/components/AltRefSwitch.svelte';
  import { XC_LEAGUES, type XcLeague } from '#lib/state/xcPrefs';
  import { XC_TYPE_LABELS } from '#lib/xc/labels';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { m } from '#lib/paraglide/messages';
  import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatDuration, formatNumber } from '#lib/ui/format';
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
          [m.export_row_duration(), formatDuration(stats.duration)],
          [m.export_row_track(), formatDistance(stats.trackLength, u)],
          [m.stats_max_from_takeoff(), formatDistance(stats.maxDistanceFromTakeoff, u)],
          [m.stats_takeoff_landing(), formatDistance(stats.straightDistance, u)],
          [m.export_row_max_altitude(), formatAlt(stats.maxAlt, u)],
          [m.stats_takeoff_alt(), formatAlt(stats.takeoffAlt, u)],
          [m.stats_max_climb(), formatVario(stats.maxClimb, u)],
          [m.stats_max_sink(), formatVario(stats.maxSink, u)],
          [m.stats_glide_ratio(), stats.glideRatio ? `${formatNumber(stats.glideRatio, 1)} : 1` : '–']
        ]
      : []
  );
  const agl = $derived(altRefPrefs.ref === 'agl');
  const summary = $derived(replay.selected && replay.transitionSummary(replay.selected, agl));
  const alt = (v: number | null) => (v == null ? '–' : formatAlt(v, u));
  const transitionItems = $derived(
    summary && summary.count
      ? [
          [agl ? m.stats_leave_climbs_agl() : m.stats_leave_climbs(), alt(summary.avgStartAlt)],
          [agl ? m.stats_arrive_next_agl() : m.stats_arrive_next(), alt(summary.avgEndAlt)],
          [agl ? m.stats_lowest_arrival_agl() : m.stats_lowest_arrival(), alt(summary.lowestArrival)],
          [m.stats_glide_avg(), summary.avgGlideRatio ? `${formatNumber(summary.avgGlideRatio, 1)} : 1` : '–'],
          [m.stats_speed_good(), summary.avgSpeed ? formatSpeed(summary.avgSpeed, u) : '–']
        ]
      : []
  );
  const PHASE_LABELS = {
    thermalling: () => m.phase_thermalling(),
    gliding: () => m.phase_gliding(),
    searching: () => m.phase_searching()
  } as const;
  const xc = $derived(replay.selected?.xc);
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
      aria-label={m.xc_league()}
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
      <p class="muted">{xc === undefined ? m.xc_scoring() : '–'}</p>
    {/if}
    <label>
      {m.xc_turnpoints()}
      <input type="number" min="1" max="30" bind:value={turnpoints} />
    </label>
    <button type="button" onclick={makeRoute}>{m.xc_open_planner()}</button>
    {#if replay.flights.length > 1}
      <ul class="xc-list">
        {#each replay.flights as f (f.flight.id)}
          <li>
            <span class="dot" style:background={f.color}></span>
            <span class="xc-name">{f.flight.pilot}</span>
            <span>{f.xc === undefined ? '…' : f.xc ? formatNumber(f.xc.points, 2) : '–'}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if stats}
  <section>
    <h3>{m.stats_flight()}</h3>
    <dl>
      {#each items as [label, value] (label)}
        <dt>{label}</dt>
        <dd>{value}</dd>
      {/each}
    </dl>
    <div class="phases" role="img" aria-label={m.stats_phase_share()}>
      {#each shares as s (s.k)}
        <span style:flex={s.v} style:background={phaseColor(s.k)} title="{PHASE_LABELS[s.k]()} {Math.round(s.v * 100)}%"></span>
      {/each}
    </div>
    <ul class="legend">
      {#each shares as s (s.k)}
        <li><span class="dot" style:background={phaseColor(s.k)}></span>{PHASE_LABELS[s.k]()} {Math.round(s.v * 100)}%</li>
      {/each}
    </ul>
    {#if transitionItems.length}
      <h4>{m.climbs_tab_transitions()} <span class="count">{summary?.count === 1 ? m.stats_glides_one({ count: 1 }) : m.stats_glides_many({ count: summary?.count ?? 0 })}</span><AltRefSwitch /></h4>
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
