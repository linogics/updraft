<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import SideDrawer from '#lib/components/SideDrawer.svelte';
  import SidebarHeader from '#lib/components/SidebarHeader.svelte';
  import { m } from '#lib/paraglide/messages';
  import { XC_TYPE_LABELS } from '#lib/xc/labels';
  import PlanMap from '#lib/components/PlanMap.svelte';
  import AirspaceControls from '#lib/plugins/builtin/airspace/AirspaceControls.svelte';
  import ThermalOverlayControls from '#lib/plugins/builtin/thermal-overlay/ThermalOverlayControls.svelte';
  import { distance, type LatLon } from '#lib/domain/geo';
  import { decodeRoute, DEFAULT_SPEED, densify, encodeRoute, MAX_ROUTE_POINTS } from '#lib/domain/route';
  import { BASEMAP_IDS, type BasemapId } from '#lib/domain/scene';
  import { BASEMAPS } from '#lib/map/basemaps';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { XC_LEAGUES, type XcLeague } from '#lib/state/xcPrefs';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { formatDuration } from '#lib/ui/format';
  import { formatDistance } from '#lib/ui/units';
  import { scoreFlight, type XcScore } from '#lib/xc/score';

  let points = $state<LatLon[]>([]);
  let history = $state<LatLon[][]>([]);
  let selected = $state<number | null>(null);
  let speed = $state(DEFAULT_SPEED);
  let basemap = $state<BasemapId>('topo');
  let mounted = $state(false);
  let copied = $state(false);
  let score = $state<XcScore | null>(null);
  let scoring = $state(false);

  // The map reads its initial view once on mount, so the URL must be parsed before it renders.
  onMount(() => {
    const q = new URL(location.href).searchParams;
    points = decodeRoute(q.get('r'));
    const v = Number(q.get('v'));
    if (v > 0) speed = v;
    mounted = true;
  });

  function commit(next: LatLon[]) {
    history.push(points);
    points = next;
    selected = null;
    syncUrl();
  }

  function syncUrl() {
    // Local query builder, not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const q = new URLSearchParams();
    if (points.length) q.set('r', encodeRoute(points));
    if (speed !== DEFAULT_SPEED) q.set('v', String(speed));
    void replaceState(q.size ? `?${q}` : location.pathname, {});
  }

  const add = (p: LatLon) => points.length < MAX_ROUTE_POINTS && commit([...points, p]);
  const move = (i: number, p: LatLon) => commit(points.map((x, j) => (j === i ? p : x)));
  const insert = (i: number, p: LatLon) => points.length < MAX_ROUTE_POINTS && commit(points.toSpliced(i, 0, p));
  const remove = () => selected !== null && commit(points.toSpliced(selected, 1));
  const undo = () => {
    points = history.pop() ?? points;
    selected = null;
    syncUrl();
  };

  function onkey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    // The desktop sidebar is a closed popover, so only the open mobile drawer keeps the keys for its controls.
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      t.tagName !== 'INPUT' &&
      t.tagName !== 'SELECT' &&
      !document.querySelector('[popover]:popover-open')
    ) {
      e.preventDefault();
      remove();
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(location.href);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const legs = $derived(points.slice(1).map((p, i) => distance(points[i], p)));
  const total = $derived(legs.reduce((a, b) => a + b, 0));

  let run = 0;
  $effect(() => {
    const route = points;
    const league = xcPrefs.league;
    const id = ++run;
    score = null;
    scoring = route.length > 1;
    if (!scoring) return;
    const timer = setTimeout(async () => {
      // Fake one-second timestamps and no altitude, only the geometry matters.
      const fixes = densify(route).map((p, i) => ({ t: i * 1000, lat: p.lat, lon: p.lon, alt: 0 }));
      const result = await scoreFlight(fixes, league).catch(() => null);
      if (id !== run) return;
      score = result;
      scoring = false;
    }, 400);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head>
  <title>{m.plan_title()}</title>
</svelte:head>

<svelte:window onkeydown={onkey} />

<div class="page">
  <SideDrawer label={m.plan_title()}>
    {#snippet header()}<SidebarHeader title={m.home_planner_title()} />{/snippet}
    <div class="side">
      <p class="hint">{m.plan_hint()}</p>

      <div class="row">
        <button onclick={undo} disabled={!history.length}>{m.timeline_undo()}</button>
        <button onclick={remove} disabled={selected === null}>{m.plan_remove_point()}</button>
        <button onclick={() => commit([])} disabled={!points.length}>{m.common_clear()}</button>
        <button onclick={copy} disabled={!points.length}>{copied ? m.plan_copied() : m.plan_copy_link()}</button>
      </div>

      <label>
        {m.plan_base_map()}
        <select bind:value={basemap}>
          {#each BASEMAP_IDS as id (id)}<option value={id}>{BASEMAPS[id].label()}</option>{/each}
        </select>
      </label>

      <div class="readout">
        <span class="big">{formatDistance(total, unitPrefs.units)}</span>
        <span class="unit">{m.plan_total_distance()}</span>
      </div>

      <div class="row">
        <label>
          {m.plan_speed()}
          <input type="number" min="1" max="300" bind:value={speed} onchange={syncUrl} />
        </label>
        <div class="readout">
          <span class="big">{speed > 0 && total ? formatDuration((total / 1000 / speed) * 3600) : '–'}</span>
          <span class="unit">{m.plan_estimated_time()}</span>
        </div>
      </div>

      <section>
        <h2>{m.airspace_show()}</h2>
        <AirspaceControls />
      </section>

      <section>
        <h2>{m.plan_thermal_overlay()}</h2>
        <ThermalOverlayControls />
      </section>

      <section>
        <h2>{m.plan_xc_score()}</h2>
        <label>
          {m.plan_league()}
          <select value={xcPrefs.league} onchange={(e) => xcPrefs.set(e.currentTarget.value as XcLeague)}>
            {#each XC_LEAGUES as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
          </select>
        </label>
        {#if scoring}
          <p class="muted">{m.xc_scoring()}</p>
        {:else if score}
          <p>
            <strong>{m.plan_points({ points: Math.round(score.points) })}</strong>
            <span class="muted">
              {XC_TYPE_LABELS[score.type]()}, {formatDistance(score.distance, unitPrefs.units)} x {score.multiplier}
            </span>
          </p>
        {:else}
          <p class="muted">–</p>
        {/if}
      </section>

      {#if legs.length}
        <section>
          <h2>{m.plan_legs()}</h2>
          <ol>
            {#each legs as d, i (i)}
              <li>
                <span>{m.plan_leg({ from: i + 1, to: i + 2 })}</span><span>{formatDistance(d, unitPrefs.units)}</span>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    </div>
  </SideDrawer>

  <main class="mapbox">
    <h1 class="sr">{m.home_planner_title()}</h1>
    {#if mounted}
      <PlanMap
        {points}
        {selected}
        {basemap}
        onadd={add}
        onmove={move}
        oninsert={insert}
        onselect={(i) => (selected = i)}
      />
    {/if}
  </main>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
    height: 100dvh;
  }
  .mapbox {
    min-height: 0;
    min-width: 0;
  }
  .side {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 14px;
    padding: 4px 16px 20px;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  h2 {
    margin: 0 0 6px;
    font: 600 18px/1 var(--display);
  }
  .hint,
  .muted,
  .unit {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px;
  }
  label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  input {
    width: 90px;
  }
  .readout {
    display: grid;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg);
  }
  .big {
    font: 500 28px/1 var(--display);
    font-variant-numeric: tabular-nums;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 13px;
  }
  li {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  @media (max-width: 800px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
  }
</style>
