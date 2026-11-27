<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import { type Snippet, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { m } from '#lib/paraglide/messages';
  import type { PageLayout } from '#lib/state/pageLayout.svelte';

  import Menu from '../Menu.svelte';
  import { announce, movePagePanel, panelMenuId } from '../studio/panelActions.svelte';
  import { drag, liftStyle, startDrag } from '../studio/panelDrag.svelte';

  interface Panel {
    id: string;
    title: () => string;
    /** Gets the panel id, so one snippet can render several panels. */
    body: Snippet<[string]>;
    /** Adds a Remove item to the actions menu. */
    removable?: boolean;
    /** Folds the panel until the user opens it. Not stored in the layout. */
    empty?: boolean;
  }

  /** One column of draggable, collapsible panels. `labels` names every column for the move menu. */
  let {
    layout,
    column,
    label,
    labels,
    panels
  }: { layout: PageLayout; column: string; label: string; labels: Record<string, string>; panels: Panel[] } = $props();

  const shown = $derived(layout.value.columns[column].flatMap((id) => panels.find((p) => p.id === id) ?? []));
  /** Empty panels the user opened. Kept out of the layout, so opening one never changes what is stored. */
  const opened = new SvelteSet<string>();
  const isCollapsed = (p: Panel) => (p.empty ? !opened.has(p.id) : layout.value.collapsed.includes(p.id));
  function toggle(p: Panel) {
    if (!p.empty) layout.toggleCollapsed(p.id);
    else if (!opened.delete(p.id)) opened.add(p.id);
  }
  const marker = $derived(drag.dock === column ? drag.marker : null);
  // Plugin ids hold characters that are not valid in a CSS identifier.
  const viewName = (id: string) => `panel-page-${id.replace(/[^\w-]/g, '-')}`;

  /** Panels that are not rendered (hidden charts) keep their slot, so a visible index maps to a layout index. */
  function layoutIndex(id: string, to: string, visible: string[], index: number) {
    const rest = layout.value.columns[to].filter((x) => x !== id);
    const at = visible.filter((x) => x !== id)[index];
    return at === undefined ? Infinity : rest.indexOf(at);
  }

  const place = (id: string, to: string, visible: string[], index: number) =>
    movePagePanel(
      layout,
      id,
      to,
      layoutIndex(id, to, visible, index),
      panels.find((p) => p.id === id)?.title() ?? id,
      labels[to]
    );

  function grab(e: PointerEvent, p: Panel) {
    startDrag(e, p.id, {
      title: p.title(),
      current() {
        const dock = layout.columnOf(p.id);
        return dock ? { dock, index: shown.findIndex((s) => s.id === p.id) } : undefined;
      },
      drop(dock, index) {
        const ids = [...document.querySelectorAll<HTMLElement>(`[data-dock="${dock}"] > [data-panel]`)].map(
          (el) => el.dataset.panel!
        );
        void place(p.id, dock, ids, index);
      }
    });
  }

  /** The actions button disappears, so focus moves to a neighbour. */
  async function remove(p: Panel) {
    const ids = shown.map((s) => s.id);
    const neighbour = ids[ids.indexOf(p.id) + 1] ?? ids[ids.indexOf(p.id) - 1];
    layout.hide(p.id);
    announce(m.panel_removed({ title: p.title() }));
    await tick();
    if (neighbour) document.getElementById(panelMenuId(neighbour))?.focus({ preventScroll: true });
  }

  function reset() {
    layout.reset();
    announce(m.panel_layout_reset());
  }
</script>

<div
  class="column"
  role="group"
  aria-label={label}
  data-dock={column}
  data-items
  data-empty={!shown.length ? '' : undefined}
  data-dragging={drag.id ? '' : undefined}
  data-drop={marker ? '' : undefined}
  style:--drop-x={marker && `${marker.x}px`}
  style:--drop-y={marker && `${marker.y}px`}
  style:--drop-w={marker && `${marker.w}px`}
>
  {#each shown as p, i (p.id)}
    {@const collapsed = isCollapsed(p)}
    {@const ids = shown.map((s) => s.id)}
    {#if drag.id === p.id}
      <!-- Keeps the lifted panel's place, so nothing jumps while it is dragged. -->
      <div class="slot" style:width="{drag.rect.width}px" style:height="{drag.rect.height}px" aria-hidden="true"></div>
    {/if}
    <section
      class="card"
      aria-labelledby="panel-title-{p.id}"
      data-panel={p.id}
      data-lifted={drag.id === p.id ? '' : undefined}
      style={liftStyle(p.id)}
      style:view-transition-name={viewName(p.id)}
    >
      <header class:folded={collapsed}>
        <button
          type="button"
          class="grip"
          tabindex="-1"
          aria-label={m.panel_drag({ title: p.title() })}
          onpointerdown={(e) => grab(e, p)}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <h2 id="panel-title-{p.id}">
          <button type="button" class="fold" aria-expanded={!collapsed} onclick={() => toggle(p)}>
            <ChevronDown size={14} aria-hidden="true" />{p.title()}
          </button>
        </h2>
        <Menu label={m.panel_actions({ title: p.title() })} triggerId={panelMenuId(p.id)}>
          <button type="button" disabled={i === 0} onclick={() => place(p.id, column, ids, i - 1)}>
            {m.panel_move_up()}
          </button>
          <button type="button" disabled={i === shown.length - 1} onclick={() => place(p.id, column, ids, i + 1)}>
            {m.panel_move_down()}
          </button>
          {#each Object.keys(labels).filter((c) => c !== column) as c (c)}
            <button type="button" onclick={() => place(p.id, c, [], Infinity)}>
              {m.panel_move_to_column({ column: labels[c] })}
            </button>
          {/each}
          {#if p.removable}
            <button type="button" onclick={() => remove(p)}>{m.panel_remove()}</button>
          {/if}
          <hr />
          <button type="button" onclick={reset}>{m.panel_reset_layout()}</button>
        </Menu>
      </header>
      {#if !collapsed}{@render p.body(p.id)}{/if}
    </section>
  {/each}
</div>

<style>
  .column {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 16px;
    min-width: 0;
  }
  /* An empty column stays a drop target while a panel is dragged. */
  .column[data-dragging][data-empty] {
    min-height: 80px;
    outline: 1px dashed var(--drop-slot-border, var(--border));
    outline-offset: 4px;
    border-radius: 8px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
  }
  header.folded {
    margin-bottom: 0;
  }
  header h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font: 600 18px/1.2 var(--display);
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
  .grip {
    display: flex;
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .grip:hover {
    color: var(--text);
  }
  :global(html.panel-dragging),
  :global(html.panel-dragging *) {
    cursor: grabbing !important;
  }
  /* The lifted real item follows the pointer, leaves its slot and ignores the pointer so hit tests see the columns. */
  [data-lifted] {
    position: fixed;
    z-index: 30;
    scale: 1.02;
    pointer-events: none;
    background: var(--surface);
    box-shadow: var(--drop-lift-shadow, 0 8px 24px rgb(0 0 0 / 0.35));
    opacity: var(--drop-lift-opacity, 0.95);
    overflow: hidden;
  }
  .slot {
    box-sizing: border-box;
    border: 1px dashed var(--drop-slot-border, var(--border));
    border-radius: 8px;
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
  @media (forced-colors: active) {
    [data-drop]::before,
    [data-drop]::after {
      background: Highlight;
    }
    [data-lifted] {
      border: 1px solid CanvasText;
    }
  }
</style>
