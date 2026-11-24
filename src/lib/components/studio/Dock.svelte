<script lang="ts">
  import type { Snippet } from 'svelte';
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { studioLayout } from '#lib/state/studioLayout.svelte';
  import { DOCK_LABELS, DOCKS, panelById, type Dock, type PanelDef } from '#lib/studio/panels';
  import Menu from '../Menu.svelte';
  import { hidePanel, movePanel, panelMenuId } from './panelActions.svelte';
  import PanelHost from './PanelHost.svelte';

  /** Side docks stack their panels, the bottom dock shows one at a time behind tabs, next to `lead`. */
  let { dock, studio, ids, lead }: { dock: Dock; studio: StudioState; ids: string[]; lead?: Snippet } = $props();

  const panels = $derived(ids.map(panelById).filter((p): p is PanelDef => !!p));
  const open = $derived(studioLayout.value.open[dock]);
  const active = $derived(panels.find((p) => p.id === studioLayout.activeTab));
  const sideLabel = $derived(dock === 'left' ? m.studio_outliner() : m.studio_side_panel());
</script>

{#snippet actions(p: PanelDef, i: number)}
  {@const back = dock === 'bottom' ? m.panel_move_left() : m.panel_move_up()}
  {@const forward = dock === 'bottom' ? m.panel_move_right() : m.panel_move_down()}
  <Menu label={m.panel_actions({ title: p.title() })} triggerId={panelMenuId(p.id)}>
    <button type="button" disabled={i === 0} onclick={() => movePanel(p.id, dock, i - 1)}>{back}</button>
    <button type="button" disabled={i === panels.length - 1} onclick={() => movePanel(p.id, dock, i + 1)}>
      {forward}
    </button>
    {#each DOCKS.filter((d) => d !== dock) as d (d)}
      <button type="button" onclick={() => movePanel(p.id, d, Infinity)}>
        {m.panel_move_to_dock({ dock: DOCK_LABELS[d]() })}
      </button>
    {/each}
    <hr />
    <button type="button" onclick={() => hidePanel(p.id)}>{m.panel_hide()}</button>
  </Menu>
{/snippet}

{#if dock === 'bottom'}
  <div class="transport">
    {@render lead?.()}
    {#if panels.length}
      <div class="tabs" role="tablist" aria-label={m.studio_bottom_panel()} hidden={!open}>
        {#each panels as p, i (p.id)}
          <div class="tab" role="presentation" style:view-transition-name="panel-{p.id}">
            <button
              role="tab"
              id="tab-{p.id}"
              aria-selected={active?.id === p.id}
              aria-controls="bottom-panel"
              onclick={() => studioLayout.setTab(p.id)}
            >
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
    style:grid-area={dock === 'left' ? 'outliner' : 'aside'}
  >
    {#each panels as p, i (p.id)}
      <section aria-labelledby="panel-title-{p.id}" style:view-transition-name="panel-{p.id}">
        <header>
          <h3 id="panel-title-{p.id}">{p.title()}</h3>
          {@render actions(p, i)}
        </header>
        <PanelHost panel={p} {studio} />
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
    justify-content: space-between;
    margin-bottom: 8px;
  }
  header h3 {
    margin: 0;
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
    padding: 4px 4px 4px 10px;
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
