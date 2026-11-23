<script lang="ts">
  import { indexAt } from '#lib/domain/timeline';
  import { transitionAlts, type Transition } from '#lib/domain/analysis/transitions';
  import { m } from '#lib/paraglide/messages';
  import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { varioColor } from '#lib/ui/colors';
  import { formatClock, formatDuration, formatNumber } from '#lib/ui/format';
  import {
    formatAlt,
    formatDistance,
    formatSpeed,
    formatVario,
    fromAlt,
    fromVario,
    toAlt,
    toVario,
    UNIT_LABELS
  } from '#lib/ui/units';

  let { replay }: { replay: ReplayState } = $props();

  /** Slider ranges in SI units; display steps per unit keep the values round. */
  const MAX_GAIN = 1500;
  const MAX_CLIMB = 4;
  const GAIN_STEP = { m: 25, ft: 100 } as const;
  const CLIMB_STEP = { ms: 0.1, fpm: 20, kt: 0.2 } as const;

  const KIND_LABELS = {
    launch: () => m.thermal_kind_launch(),
    glide: () => m.thermal_kind_glide(),
    final: () => m.thermal_kind_final()
  } as const;

  let tab = $state<'thermals' | 'transitions'>('thermals');
  const sel = $derived(replay.selected);
  const u = $derived(unitPrefs.units);
  const thermals = $derived(sel?.climbs.thermals ?? []);
  const transitions = $derived(sel?.climbs.transitions ?? []);
  const total = $derived(sel ? sel.analysis.thermals.filter((t) => t.gain > 0).length : 0);
  const current = $derived(sel ? indexAt(sel.flight.fixes, replay.time) : -1);

  const agl = $derived(altRefPrefs.ref === 'agl');
  const alt = (t: Transition, end: 'start' | 'end') => {
    const v = transitionAlts(t, agl && sel ? (i) => replay.aglAt(sel, i) : undefined)[end];
    return v === undefined ? '–' : formatAlt(v, u);
  };

  const gainStep = $derived(GAIN_STEP[u.alt]);
  const climbStep = $derived(CLIMB_STEP[u.vario]);
  const snap = (v: number, step: number) => Math.round(v / step) * step;
  const gain = $derived(snap(toAlt(replay.thermalFilter.minGain, u.alt), gainStep));
  const climb = $derived(snap(toVario(replay.thermalFilter.minClimb, u.vario), climbStep));
</script>

{#if sel}
  <section>
    <h3>{m.climbs_heading()}</h3>
    <div class="filter">
      <label for="min-gain">{m.climbs_min_gain()}</label>
      <input
        id="min-gain"
        type="range"
        min="0"
        max={snap(toAlt(MAX_GAIN, u.alt), gainStep)}
        step={gainStep}
        value={gain}
        oninput={(e) =>
          replay.setThermalFilter({ ...replay.thermalFilter, minGain: fromAlt(+e.currentTarget.value, u.alt) })}
      />
      <output for="min-gain">{gain ? formatAlt(replay.thermalFilter.minGain, u) : m.common_any()}</output>
      <label for="min-climb">{m.climbs_min_climb()}</label>
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
      <output for="min-climb">
        {climb ? `${formatNumber(climb, 1, 0)} ${UNIT_LABELS.vario[u.vario]}` : m.common_any()}
      </output>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'thermals'} onclick={() => (tab = 'thermals')}>
        {m.climbs_tab_thermals()}
        <span class="count">
          {thermals.length === total ? total : m.climbs_count_of({ count: thermals.length, total })}
        </span>
      </button>
      <button role="tab" aria-selected={tab === 'transitions'} onclick={() => (tab = 'transitions')}>
        {m.climbs_tab_transitions()} <span class="count">{transitions.length}</span>
      </button>
    </div>
    {#if tab === 'transitions'}
      <ol>
        {#each transitions as t (t.start)}
          <li class:active={current >= t.start && current < t.end}>
            <button class="row" onclick={() => replay.seek(sel.flight.fixes[t.start].t)}>
              <span class="n" class:kind={t.kind !== 'glide'}>
                {t.kind === 'glide' ? '↘' : t.kind === 'launch' ? '⇢' : '⇥'}
              </span>
              <span class="time">{formatClock(sel.flight.fixes[t.start].t)}</span>
              <span class="gain">{formatDistance(t.distance, u)}</span>
              <span class="climb">{t.glideRatio ? `${formatNumber(t.glideRatio, 1)} : 1` : '–'}</span>
              <span class="meta">
                {#if t.kind === 'glide'}
                  {m.climbs_meta_plain({
                    from: alt(t, 'start'),
                    to: alt(t, 'end'),
                    agl: agl ? ' AGL' : '',
                    speed: formatSpeed(t.speed, u),
                    duration: formatDuration(t.duration)
                  })}
                {:else}
                  {m.climbs_meta_kind({
                    kind: KIND_LABELS[t.kind](),
                    from: alt(t, 'start'),
                    to: alt(t, 'end'),
                    agl: agl ? ' AGL' : '',
                    speed: formatSpeed(t.speed, u),
                    duration: formatDuration(t.duration)
                  })}
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ol>
    {:else if thermals.length === 0}
      <p class="empty">{total ? m.climbs_none_match() : m.climbs_none_detected()}</p>
    {:else}
      <ol>
        {#each thermals as t, i (t.start)}
          <li class:active={current >= t.start && current <= t.end}>
            <button class="row" onclick={() => replay.seek(sel.flight.fixes[t.start].t)}>
              <span class="n">
                <span class="swatch" style="background: {varioColor(t.avgClimb)}" aria-hidden="true"></span>{i + 1}
              </span>
              <span class="time">{formatClock(sel.flight.fixes[t.start].t)}</span>
              <span class="gain">+{formatAlt(t.gain, u)}</span>
              <span class="climb">{formatVario(t.avgClimb, u)}</span>
              <span class="meta">
                {m.climbs_thermal_meta({ duration: formatDuration(t.duration), alt: formatAlt(t.exitAlt, u) })}
              </span>
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
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: none;
    padding: 2px 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    border-bottom-color: var(--secondary);
  }
  .row {
    all: unset;
    box-sizing: border-box;
    width: 100%;
    display: grid;
    grid-template-columns: 34px auto 1fr auto;
    gap: 2px 8px;
    padding: 5px 6px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .row:hover,
  li.active .row {
    background: var(--surface-2);
  }
  .n {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
  }
  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .n.kind {
    color: var(--text);
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
