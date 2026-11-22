<script lang="ts">
  import { m } from '#lib/paraglide/messages';

  /**
   * Window splitter (WAI-ARIA pattern). Drag or arrow keys resize, Enter or the chevron collapses,
   * double-click resets. `sign` is -1 when moving left/up makes the controlled panel bigger,
   * `scale` converts pixels to the unit of `value`.
   */
  let {
    label,
    axis,
    value,
    min,
    max,
    sign = 1,
    scale = 1,
    open = true,
    onchange,
    onreset,
    ontoggle
  }: {
    label: string;
    axis: 'x' | 'y';
    value: number;
    min: number;
    max: number;
    sign?: 1 | -1;
    scale?: number;
    open?: boolean;
    onchange: (v: number) => void;
    onreset: () => void;
    ontoggle?: () => void;
  } = $props();

  const KEY_STEP_PX = 16;
  let start: { pos: number; value: number } | null = $state(null);

  const pos = (e: PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);

  function down(e: PointerEvent) {
    if (!open || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start = { pos: pos(e), value };
  }

  function move(e: PointerEvent) {
    if (start) onchange(start.value + sign * (pos(e) - start.pos) * scale);
  }

  function key(e: KeyboardEvent) {
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === 'Enter' && ontoggle) ontoggle();
    else if (!open) return;
    else if (e.key === back || e.key === fwd) onchange(value + sign * (e.key === fwd ? 1 : -1) * KEY_STEP_PX * scale);
    else if (e.key === 'Home') onchange(min);
    else if (e.key === 'End') onchange(max);
    else return;
    e.preventDefault();
  }

  // Chevron points the way the panel moves when clicked.
  const chevron = $derived.by(() => {
    const towards = (sign === -1) === open; // true: panel grows towards the start (left/up) side
    if (axis === 'x') return towards ? '›' : '‹';
    return towards ? '⌄' : '⌃';
  });
</script>

<!-- The button is a sibling of the separator, so assistive tech lists it. -->
<div class="splitter {axis}" class:closed={!open} class:start={sign === 1}>
  <!-- A focusable separator is an interactive widget in ARIA, Svelte does not know that. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="bar"
    class:dragging={!!start}
    role="separator"
    tabindex="0"
    aria-label={label}
    aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    aria-valuenow={open ? Math.round(value * 100) / 100 : min}
    aria-valuemin={min}
    aria-valuemax={max}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={() => (start = null)}
    onpointercancel={() => (start = null)}
    ondblclick={() => open && onreset()}
    onkeydown={key}
  ></div>
  {#if ontoggle}
    <button
      tabindex="-1"
      aria-label={open
        ? m.splitter_collapse({ label: label.toLowerCase() })
        : m.splitter_expand({ label: label.toLowerCase() })}
      aria-expanded={open}
      onclick={ontoggle}
    >
      {chevron}
    </button>
  {/if}
</div>

<style>
  .splitter {
    position: relative;
    z-index: 3;
    display: grid;
    place-items: center;
  }
  .bar {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  /* The gutter between panels is the handle. A thin line shows on hover, drag and focus. */
  .x .bar {
    inset: 0 2px;
  }
  .y .bar {
    inset: 2px 0;
  }
  .x .bar {
    cursor: col-resize;
  }
  .y .bar {
    cursor: row-resize;
  }
  .splitter.x {
    width: 6px;
  }
  .splitter.y {
    height: 6px;
  }
  /* Wider invisible hit area around the 1px line. */
  .bar::before {
    content: '';
    position: absolute;
    inset: -4px;
  }
  .x .bar::before {
    inset: 0 -4px;
  }
  .y .bar::before {
    inset: -4px 0;
  }
  .splitter:hover .bar,
  .bar.dragging,
  .bar:focus-visible {
    background: var(--primary-hi);
    outline: none;
  }
  button {
    position: relative;
    padding: 0;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1;
    color: var(--muted);
    background: var(--surface-2);
  }
  .x button {
    width: 14px;
    height: 32px;
  }
  .y button {
    width: 32px;
    height: 14px;
  }
  /* A closed side panel leaves the line at the screen edge: keep the chevron inside. */
  .x.closed button {
    transform: translateX(-4px);
  }
  .x.closed.start button {
    transform: translateX(4px);
  }
  button:hover {
    color: var(--text);
  }
</style>
