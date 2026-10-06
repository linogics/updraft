<script lang="ts">
  import { distance } from '#lib/domain/geo';
  import { indexAt, positionAt } from '#lib/domain/timeline';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatClock } from '#lib/ui/format';
  import { formatAlt, formatDistance, formatSpeed, formatVario } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

  // Live values, recomputed as time advances.
  const rows = $derived(
    replay.flights.map((f) => {
      const { fixes } = f.flight;
      const t = replay.time;
      const inFlight = t >= fixes[0].t && t <= fixes[fixes.length - 1].t;
      const i = indexAt(fixes, t);
      const p = positionAt(fixes, t);
      const u = unitPrefs.units;
      return {
        f,
        inFlight,
        alt: formatAlt(p.alt, u),
        vario: formatVario(inFlight ? f.analysis.vario[i] : 0, u),
        speed: formatSpeed(inFlight ? f.analysis.speed[i] : 0, u),
        varioUp: f.analysis.vario[i] > 0.2,
        dist: formatDistance(distance(fixes[0], p), u),
        // Recorded clock time, shown when the flight is shifted on the replay clock.
        local: f.timeOffset ? `${f.source.date} ${formatClock(replay.localTime(f))}` : null
      };
    })
  );
</script>

<section>
  <h3>Pilots</h3>
  <ul>
    {#each rows as r (r.f.flight.id)}
      {@const selected = r.f.flight.id === replay.selected?.flight.id}
      <li class:selected class:landed={!r.inFlight}>
        <input
          type="checkbox"
          checked={r.f.visible}
          onchange={(e) => replay.setVisible(r.f.flight.id, e.currentTarget.checked)}
          aria-label="Show {r.f.flight.pilot}"
        />
        <button class="name" onclick={() => (replay.selectedId = r.f.flight.id)}>
          <span class="swatch" style:background={r.f.color}></span>
          <span>
            <span class="pilot">{r.f.flight.pilot}</span>
            <span class="glider">{r.f.flight.glider ?? r.f.flight.sourceName}</span>
          </span>
        </button>
        <span class="live">
          <span>{r.alt}</span>
          <span class:up={r.varioUp}>{r.vario}</span>
          <span>{r.speed}</span>
          <span class="muted">{r.dist}</span>
          {#if r.local}<span class="muted" title="Recorded time of this flight">{r.local}</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px;
    padding: 6px 4px;
    border-radius: 6px;
  }
  li.selected {
    background: var(--surface-2);
  }
  li.landed {
    opacity: 0.55;
  }
  .name {
    all: unset;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    min-width: 0;
  }
  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .pilot {
    display: block;
    font-weight: 600;
  }
  .glider {
    display: block;
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .live {
    display: grid;
    justify-items: end;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .up {
    font-weight: 700;
  }
  .muted {
    color: var(--muted);
  }
</style>
