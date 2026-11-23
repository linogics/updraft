<script lang="ts">
  import { distance } from '#lib/domain/geo';
  import { indexAt, positionAt } from '#lib/domain/timeline';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { m } from '#lib/paraglide/messages';
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
      const agl = replay.aglAt(f, i);
      return {
        f,
        inFlight,
        alt: formatAlt(p.alt, u),
        agl: inFlight && agl !== undefined ? formatAlt(agl, u) : '–',
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
  <h3>{m.pilots_heading()}</h3>
  <div class="head"><span class="live"><span>{m.pilots_alt()}</span><span>AGL</span></span></div>
  <ul>
    {#each rows as r (r.f.flight.id)}
      {@const selected = r.f.flight.id === replay.selected?.flight.id}
      <li class:selected class:landed={!r.inFlight}>
        <input
          type="checkbox"
          checked={r.f.visible}
          onchange={(e) => replay.setVisible(r.f.flight.id, e.currentTarget.checked)}
          aria-label={m.pilots_show({ pilot: r.f.flight.pilot })}
        />
        <span class="color">
          <input
            type="color"
            class="swatch"
            value={r.f.color}
            style:background={r.f.color}
            onchange={(e) => replay.setPilotColor(r.f.flight.id, e.currentTarget.value)}
            aria-label={m.pilots_colour_of({ pilot: r.f.flight.pilot })}
            title={m.pilots_change_colour()}
          />
          {#if replay.colorOverrides[r.f.flight.id]}
            <button
              class="reset"
              onclick={() => replay.setPilotColor(r.f.flight.id, null)}
              title={m.pilots_reset_colour()}
              aria-label={m.pilots_reset_colour_of({ pilot: r.f.flight.pilot })}
            >
              ✕
            </button>
          {/if}
        </span>
        <button class="name" onclick={() => (replay.selectedId = r.f.flight.id)}>
          <span>
            <span class="pilot">{r.f.flight.pilot}</span>
            <span class="glider">{r.f.flight.glider ?? r.f.flight.sourceName}</span>
          </span>
        </button>
        <span class="live">
          <span>{r.alt}</span>
          <span title={m.pilots_agl_title()}>{r.agl}</span>
          <span class:up={r.varioUp}>{r.vario}</span>
          <span>{r.speed}</span>
          <span class="muted">{r.dist}</span>
          {#if r.local}<span class="muted" title={m.pilots_recorded_time()}>{r.local}</span>{/if}
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
    grid-template-columns: auto auto 1fr auto;
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
  .color {
    position: relative;
    display: flex;
  }
  .swatch {
    appearance: none;
    flex: none;
    width: 14px;
    height: 14px;
    padding: 0;
    border: 2px solid var(--surface);
    border-radius: 50%;
    cursor: pointer;
  }
  .swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .swatch::-webkit-color-swatch,
  .swatch::-moz-color-swatch {
    border: 0;
    border-radius: 50%;
  }
  .reset {
    all: unset;
    position: absolute;
    top: -7px;
    right: -8px;
    font-size: 9px;
    color: var(--muted);
    cursor: pointer;
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
  .head {
    display: flex;
    justify-content: flex-end;
    padding: 0 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .live {
    display: grid;
    grid-template-columns: auto auto;
    justify-items: end;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .live > span:nth-child(n + 3) {
    grid-column: 1 / -1;
  }
  .up {
    font-weight: 700;
  }
  .muted {
    color: var(--muted);
  }
</style>
