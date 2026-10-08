<script lang="ts">
  import { indexAt } from '#lib/domain/timeline';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatClock, formatDuration } from '#lib/ui/format';
  import { formatAlt, formatVario, fromAlt, fromVario, toAlt, toVario, UNIT_LABELS } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

  /** Slider ranges in SI units; display steps per unit keep the values round. */
  const MAX_GAIN = 1500;
  const MAX_CLIMB = 4;
  const GAIN_STEP = { m: 25, ft: 100 } as const;
  const CLIMB_STEP = { ms: 0.1, fpm: 20, kt: 0.2 } as const;

  const sel = $derived(replay.selected);
  const u = $derived(unitPrefs.units);
  const thermals = $derived(sel?.climbs.thermals ?? []);
  const total = $derived(sel ? sel.analysis.thermals.filter((t) => t.gain > 0).length : 0);
  const current = $derived(sel ? indexAt(sel.flight.fixes, replay.time) : -1);

  const gainStep = $derived(GAIN_STEP[u.alt]);
  const climbStep = $derived(CLIMB_STEP[u.vario]);
  const snap = (v: number, step: number) => Math.round(v / step) * step;
  const gain = $derived(snap(toAlt(replay.thermalFilter.minGain, u.alt), gainStep));
  const climb = $derived(snap(toVario(replay.thermalFilter.minClimb, u.vario), climbStep));
</script>

{#if sel}
  <section>
    <h3>Thermals <span class="count">{thermals.length === total ? total : `${thermals.length} of ${total}`}</span></h3>
    <div class="filter">
      <label for="min-gain">Min gain</label>
      <input
        id="min-gain"
        type="range"
        min="0"
        max={snap(toAlt(MAX_GAIN, u.alt), gainStep)}
        step={gainStep}
        value={gain}
        oninput={(e) => replay.setThermalFilter({ ...replay.thermalFilter, minGain: fromAlt(+e.currentTarget.value, u.alt) })}
      />
      <output for="min-gain">{gain ? formatAlt(replay.thermalFilter.minGain, u) : 'any'}</output>
      <label for="min-climb">Min climb</label>
      <input
        id="min-climb"
        type="range"
        min="0"
        max={snap(toVario(MAX_CLIMB, u.vario), climbStep)}
        step={climbStep}
        value={climb}
        oninput={(e) =>
          replay.setThermalFilter({ ...replay.thermalFilter, minClimb: fromVario(+e.currentTarget.value, u.vario) })}
      />
      <output for="min-climb">{climb ? `${+climb.toFixed(1)} ${UNIT_LABELS.vario[u.vario]}` : 'any'}</output>
    </div>
    {#if thermals.length === 0}
      <p class="empty">{total ? 'No thermals match the filter.' : 'No thermals detected.'}</p>
    {:else}
      <ol>
        {#each thermals as t, i (t.start)}
          <li class:active={current >= t.start && current <= t.end}>
            <button onclick={() => replay.seek(sel.flight.fixes[t.start].t)}>
              <span class="n">{i + 1}</span>
              <span class="time">{formatClock(sel.flight.fixes[t.start].t)}</span>
              <span class="gain">+{formatAlt(t.gain, u)}</span>
              <span class="climb">{formatVario(t.avgClimb, u)}</span>
              <span class="meta">{formatDuration(t.duration)} · top {formatAlt(t.exitAlt, u)}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  .count {
    color: var(--muted);
    font-weight: 400;
  }
  .filter {
    display: grid;
    grid-template-columns: auto 1fr 72px;
    align-items: center;
    gap: 4px 8px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .filter input {
    min-width: 0;
  }
  .filter output {
    text-align: right;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: grid;
    grid-template-columns: 22px auto 1fr auto;
    gap: 2px 8px;
    padding: 5px 6px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  button:hover,
  li.active button {
    background: var(--surface-2);
  }
  .n {
    color: var(--muted);
  }
  .gain {
    font-weight: 600;
    text-align: right;
  }
  .climb {
    text-align: right;
  }
  .meta {
    grid-column: 2 / -1;
    font-size: 11px;
    color: var(--muted);
  }
</style>
