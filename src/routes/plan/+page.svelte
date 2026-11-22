<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import Logo from '#lib/components/Logo.svelte';
  import PlanMap from '#lib/components/PlanMap.svelte';
  import AirspaceControls from '#lib/components/AirspaceControls.svelte';
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
    const q = new URLSearchParams();
    if (points.length) q.set('r', encodeRoute(points));
    if (speed !== DEFAULT_SPEED) q.set('v', String(speed));
    replaceState(q.size ? `?${q}` : location.pathname, {});
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && t.tagName !== 'INPUT' && t.tagName !== 'SELECT') {
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
  <title>XC planner | updraft</title>
</svelte:head>

<svelte:window onkeydown={onkey} />

<div class="page">
  <div class="mapbox">
    {#if mounted}
      <PlanMap {points} {selected} {basemap} onadd={add} onmove={move} oninsert={insert} onselect={(i) => (selected = i)} />
    {/if}
  </div>

  <aside>
    <Logo />
    <h1>XC planner</h1>
    <p class="hint">Click the map to add points. Drag a point to move it, click a leg midpoint to insert one.</p>

    <div class="row">
      <button onclick={undo} disabled={!history.length}>Undo</button>
      <button onclick={remove} disabled={selected === null}>Remove point</button>
      <button onclick={() => commit([])} disabled={!points.length}>Clear</button>
      <button onclick={copy} disabled={!points.length}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>

    <label>
      Base map
      <select bind:value={basemap}>
        {#each BASEMAP_IDS as id (id)}<option value={id}>{BASEMAPS[id].label}</option>{/each}
      </select>
    </label>

    <div class="readout">
      <span class="big">{formatDistance(total, unitPrefs.units)}</span>
      <span class="unit">total distance</span>
    </div>

    <div class="row">
      <label>
        Speed (km/h)
        <input type="number" min="1" max="300" bind:value={speed} onchange={syncUrl} />
      </label>
      <div class="readout">
        <span class="big">{speed > 0 && total ? formatDuration((total / 1000 / speed) * 3600) : '–'}</span>
        <span class="unit">estimated time</span>
      </div>
    </div>

    <section>
      <h2>Airspaces</h2>
      <AirspaceControls />
    </section>

    <section>
      <h2>XC score</h2>
      <label>
        League
        <select value={xcPrefs.league} onchange={(e) => xcPrefs.set(e.currentTarget.value as XcLeague)}>
          {#each XC_LEAGUES as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
        </select>
      </label>
      {#if scoring}
        <p class="muted">Scoring…</p>
      {:else if score}
        <p>
          <strong>{Math.round(score.points)} points</strong>
          <span class="muted">{score.type}, {formatDistance(score.distance, unitPrefs.units)} x {score.multiplier}</span>
        </p>
      {:else}
        <p class="muted">–</p>
      {/if}
    </section>

    {#if legs.length}
      <section>
        <h2>Legs</h2>
        <ol>
          {#each legs as d, i (i)}
            <li><span>{i + 1} to {i + 2}</span><span>{formatDistance(d, unitPrefs.units)}</span></li>
          {/each}
        </ol>
      </section>
    {/if}
  </aside>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: 1fr 340px;
    height: 100dvh;
  }
  .mapbox {
    min-height: 0;
    min-width: 0;
  }
  aside {
    display: grid;
    align-content: start;
    gap: 14px;
    padding: 20px 16px;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    background: var(--surface);
  }
  h1 {
    margin: 0;
    font: 600 28px/1.1 var(--display);
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
  @media (max-width: 760px) {
    .page {
      grid-template-columns: 1fr;
      grid-template-rows: 55dvh auto;
      height: auto;
    }
    aside {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
  }
</style>
