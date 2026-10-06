<script lang="ts">
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { phaseColor } from '#lib/ui/colors';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatDuration } from '#lib/ui/format';
  import { formatAlt, formatDistance, formatVario } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

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
  const shares = $derived(
    stats ? (['thermalling', 'gliding', 'searching'] as const).map((k) => ({ k, v: stats.phaseShare[k] })) : []
  );
</script>

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
