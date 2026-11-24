<script lang="ts">
  import type { StudioState } from '#lib/state/studio.svelte';
  import { phaseColor } from '#lib/ui/colors';
  import AltRefSwitch from '#lib/components/AltRefSwitch.svelte';
  import { useNeed } from '#lib/state/useNeed.svelte';
  import { m } from '#lib/paraglide/messages';
  import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatDuration, formatNumber } from '#lib/ui/format';
  import { formatAlt, formatDistance, formatSpeed, formatVario } from '#lib/ui/units';

  let { studio }: { studio: StudioState } = $props();

  const stats = $derived(studio.selected?.analysis.stats);
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
  useNeed(
    () => studio,
    'ground',
    () => agl
  );
  const summary = $derived(studio.selected && studio.transitionSummary(studio.selected, agl));
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
  const shares = $derived(
    stats ? (['thermalling', 'gliding', 'searching'] as const).map((k) => ({ k, v: stats.phaseShare[k] })) : []
  );
</script>

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
        <span style:flex={s.v} style:background={phaseColor(s.k)} title="{PHASE_LABELS[s.k]()} {Math.round(s.v * 100)}%"
        ></span>
      {/each}
    </div>
    <ul class="legend">
      {#each shares as s (s.k)}
        <li>
          <span class="dot" style:background={phaseColor(s.k)}></span>{PHASE_LABELS[s.k]()}
          {Math.round(s.v * 100)}%
        </li>
      {/each}
    </ul>
    {#if transitionItems.length}
      <h4>
        {m.climbs_tab_transitions()}
        <span class="count">
          {summary?.count === 1
            ? m.stats_glides_one({ count: 1 })
            : m.stats_glides_many({ count: summary?.count ?? 0 })}
        </span><AltRefSwitch />
      </h4>
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
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
