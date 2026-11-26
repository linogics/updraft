<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { replaceState } from '$app/navigation';

  import PanelColumn from '#lib/components/panels/PanelColumn.svelte';
  import PlanPanelsMenu from '#lib/components/plan/PlanPanelsMenu.svelte';
  import PlanMap from '#lib/components/PlanMap.svelte';
  import SidebarHeader from '#lib/components/SidebarHeader.svelte';
  import SideDrawer from '#lib/components/SideDrawer.svelte';
  import AddPluginDialog from '#lib/components/studio/AddPluginDialog.svelte';
  import { panelStatus } from '#lib/components/studio/panelActions.svelte';
  import PanelHost from '#lib/components/studio/PanelHost.svelte';
  import type { LatLon } from '#lib/domain/geo';
  import { decodeRoute, DEFAULT_SPEED, densify, encodeRoute, MAX_ROUTE_POINTS } from '#lib/domain/route';
  import { BASEMAP_IDS, type BasemapId } from '#lib/domain/scene';
  import { writeRouteGpx, writeXctsk } from '#lib/domain/task';
  import { BASEMAPS } from '#lib/map/basemaps';
  import { m } from '#lib/paraglide/messages';
  import { providePlanService, providePlanState } from '#lib/plan/planService.svelte';
  import { planRegistry } from '#lib/plan/registry.svelte';
  import { PlanState } from '#lib/state/plan.svelte';
  import { LEGS_PANEL, planLayout } from '#lib/state/planLayout.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import type { PluginHostEnv } from '#lib/studio/pluginContext.svelte';
  import { pluginEntry } from '#lib/studio/registry.svelte';
  import { formatDuration } from '#lib/ui/format';
  import { formatDistance } from '#lib/ui/units';
  import { scoreFlight } from '#lib/xc/score';

  const plan = new PlanState();
  let basemap = $state<BasemapId>('topo');
  let mounted = $state(false);
  let copied = $state(false);
  let mapEl: HTMLElement | undefined;
  let addPlugin: AddPluginDialog;

  // Plugins read the route through these services while the page is open.
  const unprovide = providePlanService(plan);
  const unprovideState = providePlanState(plan);
  onDestroy(() => {
    unprovide();
    unprovideState();
  });

  const host: PluginHostEnv = {
    overlayParent: () => mapEl
  };

  // The map reads its initial view once on mount, so the URL must be parsed before it renders.
  onMount(() => {
    const q = new URL(location.href).searchParams;
    plan.points = decodeRoute(q.get('r'));
    const v = Number(q.get('v'));
    if (v > 0) plan.speed = v;
    mounted = true;
  });

  function commit(next: LatLon[]) {
    plan.commit(next);
    syncUrl();
  }

  function syncUrl() {
    // Local query builder, not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const q = new URLSearchParams();
    if (plan.points.length) q.set('r', encodeRoute(plan.points));
    if (plan.speed !== DEFAULT_SPEED) q.set('v', String(plan.speed));
    void replaceState(q.size ? `?${q}` : location.pathname, {});
  }

  const add = (p: LatLon) => plan.points.length < MAX_ROUTE_POINTS && commit([...plan.points, p]);
  const move = (i: number, p: LatLon) => commit(plan.points.map((x, j) => (j === i ? p : x)));
  const insert = (i: number, p: LatLon) =>
    plan.points.length < MAX_ROUTE_POINTS && commit(plan.points.toSpliced(i, 0, p));
  const remove = () => plan.selected !== null && commit(plan.points.toSpliced(plan.selected, 1));
  const undo = () => {
    plan.undo();
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

  function download(text: string, ext: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `updraft-route-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    // Revoking at once can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const panels = $derived([
    ...planRegistry.list.map((p) => ({ id: p.id, title: p.title, removable: !!pluginEntry(p.id), body })),
    ...(plan.legs.length ? [{ id: LEGS_PANEL, title: () => m.plan_legs(), body }] : [])
  ]);

  let run = 0;
  $effect(() => {
    const route = plan.points;
    const league = xcPrefs.league;
    const id = ++run;
    plan.score = null;
    const active = xcPrefs.enabled && route.length > 1;
    plan.scoring = active;
    if (!active) return;
    const timer = setTimeout(async () => {
      // Fake one-second timestamps and no altitude, only the geometry matters.
      const fixes = densify(route).map((p, i) => ({ t: i * 1000, lat: p.lat, lon: p.lon, alt: 0 }));
      const result = await scoreFlight(fixes, league).catch(() => null);
      if (id !== run) return;
      plan.score = result;
      plan.scoring = false;
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
    {#snippet header()}
      <SidebarHeader title={m.home_planner_title()}>
        {#snippet actions()}<PlanPanelsMenu onadd={() => addPlugin.open()} />{/snippet}
      </SidebarHeader>
    {/snippet}
    <div class="side">
      <p class="hint">{m.plan_hint()}</p>

      <div class="row">
        <button onclick={undo} disabled={!plan.history.length}>{m.timeline_undo()}</button>
        <button onclick={remove} disabled={plan.selected === null}>{m.plan_remove_point()}</button>
        <button onclick={() => commit([])} disabled={!plan.points.length}>{m.common_clear()}</button>
        <button onclick={copy} disabled={!plan.points.length}>{copied ? m.plan_copied() : m.plan_copy_link()}</button>
      </div>

      <div class="row">
        <button
          onclick={() => download(writeXctsk(plan.points), 'xctsk', 'application/json')}
          disabled={plan.points.length < 2}
        >
          {m.plan_export_xctsk()}
        </button>
        <button
          onclick={() => download(writeRouteGpx(plan.points, m.home_planner_title()), 'gpx', 'application/gpx+xml')}
          disabled={plan.points.length < 2}
        >
          {m.plan_export_gpx()}
        </button>
      </div>

      <label>
        {m.plan_base_map()}
        <select bind:value={basemap}>
          {#each BASEMAP_IDS as id (id)}<option value={id}>{BASEMAPS[id].label()}</option>{/each}
        </select>
      </label>

      <div class="readout">
        <span class="big">{formatDistance(plan.total, unitPrefs.units)}</span>
        <span class="unit">{m.plan_total_distance()}</span>
      </div>

      <div class="row">
        <label>
          {m.plan_speed()}
          <input type="number" min="1" max="300" bind:value={plan.speed} onchange={syncUrl} />
        </label>
        <div class="readout">
          <span class="big">
            {plan.speed > 0 && plan.total ? formatDuration((plan.total / 1000 / plan.speed) * 3600) : '–'}
          </span>
          <span class="unit">{m.plan_estimated_time()}</span>
        </div>
      </div>

      <PanelColumn
        layout={planLayout}
        column="main"
        label={m.panels_menu()}
        labels={{ main: m.panels_menu() }}
        {panels}
      />
      <p class="sr" role="status">{panelStatus.text}</p>
    </div>
  </SideDrawer>

  <main class="mapbox" bind:this={mapEl}>
    <h1 class="sr">{m.home_planner_title()}</h1>
    {#if mounted}
      <PlanMap
        points={plan.points}
        selected={plan.selected}
        {basemap}
        onadd={add}
        onmove={move}
        oninsert={insert}
        onselect={(i) => (plan.selected = i)}
      />
    {/if}
  </main>
</div>

<AddPluginDialog bind:this={addPlugin} />

{#snippet body(id: string)}
  {#if id === LEGS_PANEL}
    <ol>
      {#each plan.legs as d, i (i)}
        <li>
          <span>{m.plan_leg({ from: i + 1, to: i + 2 })}</span><span>{formatDistance(d, unitPrefs.units)}</span>
        </li>
      {/each}
    </ol>
  {:else}
    {@const panel = planRegistry.byId.get(id)}
    {#if panel}<PanelHost {panel} {host} />{/if}
  {/if}
{/snippet}

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
    height: 100dvh;
  }
  .mapbox {
    position: relative;
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
  .hint,
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
