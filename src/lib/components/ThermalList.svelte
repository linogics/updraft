<script lang="ts">
  import { indexAt } from '#lib/domain/timeline';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatClock, formatDuration } from '#lib/ui/format';
  import { formatAlt, formatVario } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

  const sel = $derived(replay.selected);
  const thermals = $derived(sel ? sel.analysis.thermals.filter((t) => t.gain > 0) : []);
  const current = $derived(sel ? indexAt(sel.flight.fixes, replay.time) : -1);
</script>

{#if sel}
  <section>
    <h3>Thermals <span class="count">{thermals.length}</span></h3>
    {#if thermals.length === 0}
      <p class="empty">No thermals detected.</p>
    {:else}
      <ol>
        {#each thermals as t, i (t.start)}
          <li class:active={current >= t.start && current <= t.end}>
            <button onclick={() => replay.seek(sel.flight.fixes[t.start].t)}>
              <span class="n">{i + 1}</span>
              <span class="time">{formatClock(sel.flight.fixes[t.start].t)}</span>
              <span class="gain">+{formatAlt(t.gain, unitPrefs.units)}</span>
              <span class="climb">{formatVario(t.avgClimb, unitPrefs.units)}</span>
              <span class="meta">{formatDuration(t.duration)} · top {formatAlt(t.exitAlt, unitPrefs.units)}</span>
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
