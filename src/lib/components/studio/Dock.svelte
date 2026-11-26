<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import type { Snippet } from 'svelte';

  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { studioLayout } from '#lib/state/studioLayout.svelte';
  import { type Dock, DOCK_LABELS, DOCKS, type PanelDef } from '#lib/studio/panels';
  import { panelById } from '#lib/studio/registry.svelte';

  import Menu from '../Menu.svelte';
  import { movePanel, panelMenuId, removePanel } from './panelActions.svelte';
  import { drag, liftStyle, startDrag } from './panelDrag.svelte';
  import PanelHost from './PanelHost.svelte';

  /** Side docks stack their panels, the bottom dock shows one at a time behind tabs, next to `lead`. */
  let { dock, studio, ids, lead }: { dock: Dock; studio: StudioState; ids: string[]; lead?: Snippet } = $props();

  // Plugin ids hold a colon, which is not valid in a CSS identifier.
  const viewName = (id: string) => `panel-${id.replace(':', '-')}`;
  const panels = $derived(ids.map(panelById).filter((p): p is PanelDef => !!p));
  const open = $derived(studioLayout.value.open[dock]);
  const active = $derived(panels.find((p) => p.id === studioLayout.activeTab));
  const marker = $derived(drag.dock === dock ? drag.marker : null);
  const sideLabel = $derived(dock === 'left' ? m.studio_outliner() : m.studio_side_panel());
</script>

{#snippet grip()}
  <GripVertical size={14} aria-hidden="true" />
{/snippet}

<!-- Keeps the lifted panel's place, so nothing jumps while it is dragged. -->
{#snippet slot()}
  <div class="slot" style:width="{drag.rect.width}px" style:height="{drag.rect.height}px" aria-hidden="true"></div>
{/snippet}

{#snippet actions(p: PanelDef, i: number)}
  {@const back = dock === 'bottom' ? m.panel_move_left() : m.panel_move_up()}
  {@const forward = dock === 'bottom' ? m.panel_move_right() : m.panel_move_down()}
  <Menu label={m.panel_actions({ title: p.title() })} triggerId={panelMenuId(p.id)}>
    <button type="button" disabled={i === 0} onclick={() => movePanel(p.id, dock, i - 1)}>{back}</button>
    <button type="button" disabled={i === panels.length - 1} onclick={() => movePanel(p.id, dock, i + 1)}>
      {forward}
    </button>
    {#each p.pinned ? [] : DOCKS.filter((d) => d !== dock) as d (d)}
      <button type="button" onclick={() => movePanel(p.id, d, Infinity)}>
        {m.panel_move_to_dock({ dock: DOCK_LABELS[d]() })}
      </button>
    {/each}
    <hr />
    <button type="button" onclick={() => removePanel(p.id)}>{m.panel_remove()}</button>
  </Menu>
{/snippet}

{#if dock === 'bottom'}
  <div
    class="transport"
    data-dock={panels.length && open ? dock : undefined}
    data-drop={marker ? '' : undefined}
    style:--drop-x={marker && `${marker.x}px`}
    style:--drop-y={marker && `${marker.y}px`}
    style:--drop-w={marker && `${marker.w}px`}
  >
    {@render lead?.()}
    {#if panels.length}
      <div class="tabs" role="tablist" aria-label={m.studio_bottom_panel()} hidden={!open} data-items>
        {#each panels as p, i (p.id)}
          {#if drag.id === p.id}{@render slot()}{/if}
          <div
            class="tab"
            role="presentation"
            data-panel={p.id}
            data-lifted={drag.id === p.id ? '' : undefined}
            style={liftStyle(p.id)}
            style:view-transition-name={viewName(p.id)}
          >
            <button
              role="tab"
              id="tab-{p.id}"
              aria-selected={active?.id === p.id}
              aria-controls="bottom-panel"
              onclick={() => studioLayout.setTab(p.id)}
              onpointerdown={(e) => startDrag(e, p.id)}
            >
              {@render grip()}
              {p.title()}
            </button>
            {@render actions(p, i)}
          </div>
        {/each}
      </div>
    {/if}
  </div>
  {#if active}
    <div class="chart" id="bottom-panel" role="tabpanel" aria-labelledby="tab-{active.id}" hidden={!open}>
      {#key active.id}<PanelHost panel={active} {studio} />{/key}
    </div>
  {/if}
{:else if panels.length}
  <svelte:element
    this={dock === 'left' ? 'nav' : 'aside'}
    class="side panel"
    aria-label={sideLabel}
    hidden={!open}
    data-dock={dock}
    data-items
    data-drop={marker ? '' : undefined}
    style:--drop-x={marker && `${marker.x}px`}
    style:--drop-y={marker && `${marker.y}px`}
    style:--drop-w={marker && `${marker.w}px`}
    style:grid-area={dock === 'left' ? 'outliner' : 'aside'}
  >
    {#each panels as p, i (p.id)}
      {@const collapsed = studioLayout.value.collapsed.includes(p.id)}
      {#if drag.id === p.id}{@render slot()}{/if}
      <section
        aria-labelledby="panel-title-{p.id}"
        data-panel={p.id}
        data-lifted={drag.id === p.id ? '' : undefined}
        style={liftStyle(p.id)}
        style:view-transition-name={viewName(p.id)}
      >
        <header>
          <button
            type="button"
            class="grip"
            tabindex="-1"
            aria-label={m.panel_drag({ title: p.title() })}
            onpointerdown={(e) => startDrag(e, p.id)}
          >
            {@render grip()}
          </button>
          <h3 id="panel-title-{p.id}">
            <button
              type="button"
              class="fold"
              aria-expanded={!collapsed}
              onclick={() => studioLayout.toggleCollapsed(p.id)}
            >
              <ChevronDown size={14} aria-hidden="true" />{p.title()}
            </button>
          </h3>
          {@render actions(p, i)}
        </header>
        {#if !collapsed}<PanelHost panel={p} {studio} />{/if}
      </section>
    {/each}
  </svelte:element>
{/if}

<style>
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .side {
    position: relative;
    overflow-y: auto;
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 20px;
  }
  .side[hidden],
  .tabs[hidden],
  .chart[hidden] {
    display: none;
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }
  header h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  .fold {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .fold :global(svg) {
    flex: none;
    rotate: 0deg;
  }
  .fold[aria-expanded='false'] :global(svg) {
    rotate: -90deg;
  }
  @media (prefers-reduced-motion: no-preference) {
    .fold :global(svg) {
      transition: rotate 0.15s;
    }
  }
  /* Only the grip starts a drag, so text stays selectable and touch scrolling still works elsewhere. */
  .grip,
  .tab [role='tab'] {
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .grip {
    display: flex;
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
  }
  .grip:hover {
    color: var(--text);
  }
  :global(html.panel-dragging),
  :global(html.panel-dragging *) {
    cursor: grabbing !important;
  }
  /* The lifted real item follows the pointer, leaves its slot and ignores the pointer so hit tests see the docks. */
  [data-lifted] {
    position: fixed;
    z-index: 30;
    scale: 1.02;
    pointer-events: none;
    background: var(--surface);
    border-radius: 8px;
    padding: 8px;
    box-shadow: var(--drop-lift-shadow, 0 8px 24px rgb(0 0 0 / 0.35));
    opacity: var(--drop-lift-opacity, 0.95);
    overflow: hidden;
  }
  .slot {
    flex: none;
    box-sizing: border-box;
    border: 1px dashed var(--drop-slot-border, var(--border));
    border-radius: 8px;
  }
  .tab[data-lifted] {
    background: var(--bg);
  }
  /* Drop marker: a ring and a line in the gap, fixed so nothing shifts while dragging. */
  [data-drop]::before,
  [data-drop]::after {
    content: '';
    position: fixed;
    left: var(--drop-x);
    top: var(--drop-y);
    z-index: 40;
    pointer-events: none;
    background: var(--drop-marker-color, var(--primary));
  }
  [data-drop]::after {
    width: var(--drop-w);
    height: var(--drop-line, 3px);
    border-radius: 2px;
    translate: 0 -50%;
  }
  [data-drop]::before {
    width: var(--drop-ring, 10px);
    height: var(--drop-ring, 10px);
    border-radius: 50%;
    translate: -50% -50%;
  }
  [data-drop][data-dock='bottom']::after {
    width: var(--drop-line, 3px);
    height: var(--drop-w);
    translate: -50% 0;
  }
  [data-drop][data-dock='bottom']::before {
    translate: -50% 0;
  }
  @media (forced-colors: active) {
    [data-drop]::before,
    [data-drop]::after {
      background: Highlight;
    }
    [data-lifted] {
      border: 1px solid CanvasText;
    }
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-right: 10px;
  }
  .transport > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .chart {
    height: var(--chart);
    padding: 6px 8px;
    border-top: 1px solid var(--border);
  }
  .tabs {
    position: relative;
    display: flex;
    padding: 2px;
    border-radius: 7px;
    background: var(--surface-2);
  }
  .tab {
    display: flex;
    align-items: center;
  }
  .tab [role='tab'] {
    border: 0;
    border-radius: 5px;
    background: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 8px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }
  .tab [role='tab'][aria-selected='true'] {
    color: var(--text);
    background: var(--bg);
  }

  @media (max-width: 800px) {
    /* Stacked phone layout: docks flow and never collapse. */
    .side[hidden] {
      display: grid;
    }
    .chart[hidden] {
      display: block;
    }
    .tabs[hidden] {
      display: flex;
    }
    .chart {
      height: 150px;
    }
  }
</style>
