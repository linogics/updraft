import { tick } from 'svelte';
import { m } from '#lib/paraglide/messages';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import type { Dock } from '#lib/studio/panels';
import { panelById, registry } from '#lib/studio/registry.svelte';
import { dropIndex } from './dropIndex';
import { announce, movePanel } from './panelActions.svelte';

/** Pixels the pointer must travel before a press becomes a drag, so a click on a tab still selects it. */
const THRESHOLD = 4;
/** Auto-scroll speed in px per ms at the edge, up to 1.5 times that beyond it. */
const SCROLL_SPEED = 0.9;

interface Marker {
  /** Start of the marker line (viewport px) and its length along the list axis. */
  x: number;
  y: number;
  w: number;
}

/** Drag state shared by the docks and the studio page. `id` is null unless a drag is running. */
export const drag = $state<{
  id: string | null;
  /** Dock under the pointer and the index the panel would take there. */
  dock: string | null;
  index: number;
  marker: Marker | null;
  /** Where the lifted item was grabbed (viewport rect) and how far the pointer moved since. */
  rect: { left: number; top: number; width: number; height: number };
  dx: number;
  dy: number;
}>({ id: null, dock: null, index: 0, marker: null, rect: { left: 0, top: 0, width: 0, height: 0 }, dx: 0, dy: 0 });

/** Inline geometry of the lifted item. It leaves its slot (position: fixed in CSS), so no container clips it. */
export function liftStyle(id: string): string | undefined {
  if (drag.id !== id) return undefined;
  const { left, top, width, height } = drag.rect;
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;translate:${drag.dx}px ${drag.dy}px`;
}

/** What a drag needs to know about the panels it moves. The studio is the default, pages bring their own. */
export interface DragTarget {
  title: string;
  /** A pinned panel only reorders inside its own dock. */
  pinned?: boolean;
  current(): { dock: string; index: number } | undefined;
  drop(dock: string, index: number): void;
  /** Items of this dock lie side by side. */
  horizontal?(dock: string): boolean;
}

function studioTarget(id: string): DragTarget {
  return {
    title: panelById(id)?.title() ?? id,
    pinned: registry.pinned.includes(id),
    current() {
      const dock = (['left', 'right', 'bottom'] as const).find((d) => studioLayout.value.docks[d].includes(id));
      return dock && { dock, index: studioLayout.value.docks[dock].indexOf(id) };
    },
    drop: (dock, index) => void movePanel(id, dock as Dock, index),
    horizontal: (dock) => dock === 'bottom'
  };
}

/** Starts a pointer drag of panel `id` from its handle. Drops once on release through `target.drop`. */
export function startDrag(e: PointerEvent, id: string, target: DragTarget = studioTarget(id)) {
  if (drag.id || !e.isPrimary || e.button !== 0) return;
  const handle = e.currentTarget as HTMLElement;
  const item = handle.closest<HTMLElement>('[data-panel]');
  if (!item) return;
  const { pointerId, clientX: startX, clientY: startY } = e;
  const box = item.getBoundingClientRect();
  const { title, pinned } = target;
  let x = startX;
  let y = startY;
  let active = false;
  let list: HTMLElement | null = null;
  let raf = 0;
  let last = 0;
  const currentDock = target.current()?.dock;

  /** Finds the dock under the pointer, the slot inside it from layout midpoints, and the marker for it. */
  function update() {
    drag.dx = x - startX;
    drag.dy = y - startY;
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-dock]');
    // A pinned panel only reorders inside its own dock.
    const dockEl = pinned && hit?.dataset.dock !== currentDock ? null : hit;
    const dock = dockEl?.dataset.dock;
    list = dockEl
      ? dockEl.matches('[data-items]')
        ? dockEl
        : dockEl.querySelector<HTMLElement>('[data-items]')
      : null;
    drag.dock = dock ?? null;
    drag.marker = null;
    if (!dock || !dockEl) return;
    const items = list
      ? [...list.querySelectorAll<HTMLElement>(':scope > [data-panel]')].filter((i) => i !== item)
      : [];
    const horizontal = target.horizontal?.(dock) ?? false;
    const r = list?.getBoundingClientRect();
    const pos =
      list && r
        ? horizontal
          ? x - r.left - list.clientLeft + list.scrollLeft
          : y - r.top - list.clientTop + list.scrollTop
        : 0;
    drag.index = dropIndex(
      items.map((i) => (horizontal ? i.offsetLeft + i.offsetWidth / 2 : i.offsetTop + i.offsetHeight / 2)),
      pos
    );
    if (!list || !r || (dock === currentDock && drag.index === target.current()?.index)) return;
    const prev = items[drag.index - 1]?.getBoundingClientRect();
    const next = items[drag.index]?.getBoundingClientRect();
    if (horizontal) {
      const gap =
        prev && next ? (prev.right + next.left) / 2 : prev ? prev.right + 2 : next ? next.left - 2 : r.left + 4;
      drag.marker = { x: gap, y: r.top + 2, w: r.height - 4 };
    } else {
      const gap =
        prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom + 6 : next ? next.top - 6 : r.top + 12;
      drag.marker = { x: r.left + 8, y: gap, w: r.width - 16 };
    }
  }

  // Scrolls the side dock under the pointer while it is near or beyond its top or bottom edge.
  function frame(now: number) {
    const dt = Math.min(now - last, 50);
    last = now;
    if (list) {
      // A list that does not scroll itself (a page column) hands over to the viewport.
      const own = list.scrollHeight > list.clientHeight;
      const r = own ? list.getBoundingClientRect() : { top: 0, bottom: innerHeight, height: innerHeight };
      const zone = Math.min(box.height, r.height / 3);
      const depth = y < r.top + zone ? y - (r.top + zone) : y > r.bottom - zone ? y - (r.bottom - zone) : 0;
      const step = Math.sign(depth) * Math.min(1.5, Math.abs(depth) / zone) * SCROLL_SPEED * dt;
      const before = own ? list.scrollTop : scrollY;
      if (depth && own) list.scrollTop += step;
      else if (depth) scrollBy(0, step);
      if ((own ? list.scrollTop : scrollY) !== before) update();
    }

    raf = requestAnimationFrame(frame);
  }

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return;
    x = ev.clientX;
    y = ev.clientY;
    if (!active && Math.hypot(x - startX, y - startY) < THRESHOLD) return;

    if (!active) {
      active = true;
      Object.assign(drag, { id, rect: box, dock: null, marker: null });
      document.documentElement.classList.add('panel-dragging');
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    update();
  }

  function finish(drop: boolean) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);
    handle.removeEventListener('lostpointercapture', onCancel);
    cancelAnimationFrame(raf);
    document.documentElement.classList.remove('panel-dragging');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    if (!active) return;
    const { dock, index, marker } = drag;
    Object.assign(drag, { id: null, dock: null, marker: null, dx: 0, dy: 0 });
    // The release would click the tab, which must not select it.
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true));
    if (!drop) announce(m.panel_drag_cancelled({ title }));
    // No marker in the own dock means the panel would stay in its slot. Clear the lift first, then move once.
    else if (dock && (marker || dock !== currentDock)) void tick().then(() => target.drop(dock, index));
  }

  const swallow = (c: Event) => c.stopPropagation();
  const onUp = (ev: PointerEvent) => ev.pointerId === pointerId && finish(true);
  const onCancel = () => finish(false);
  const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && finish(false);

  handle.setPointerCapture(pointerId);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey);
  handle.addEventListener('lostpointercapture', onCancel);
}
