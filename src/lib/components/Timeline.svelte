<script lang="ts">
  import { untrack } from 'svelte';
  import { snapStart, type SyncMode } from '#lib/domain/sync';
  import { m } from '#lib/paraglide/messages';
  import { CameraEditor } from '#lib/state/cameraEditor.svelte';
  import type { LoadedFlight, StudioState } from '#lib/state/studio.svelte';
  import { SNAP_PX } from '#lib/ui/keyLanes';
  import { formatClock, formatDuration } from '#lib/ui/format';
  import CameraLabels from './CameraLabels.svelte';
  import CameraLanes from './CameraLanes.svelte';

  let { studio }: { studio: StudioState } = $props();

  const MIN_SPAN = 60_000;
  const MODES: { mode: SyncMode; label: () => string; title: () => string }[] = [
    { mode: 'real', label: () => m.sync_real(), title: () => m.sync_real_title() },
    { mode: 'timeOfDay', label: () => m.sync_day(), title: () => m.sync_day_title() },
    { mode: 'takeoff', label: () => m.sync_takeoff(), title: () => m.sync_takeoff_title() }
  ];
  const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * 60_000);

  const editor = untrack(() => new CameraEditor(studio));

  let width = $state(0);
  /** Visible time window; null fits all flights. */
  let zoom = $state<{ a: number; b: number } | null>(null);
  /** Clip being dragged: preview start replaces the committed one until pointer-up. */
  let drag = $state<{ id: string; pointerX: number; origin: number; start: number; guide: number | null } | null>(null);

  const full = $derived.by(() => {
    const pad = Math.max((studio.end - studio.start) * 0.03, 30_000);
    return { a: studio.start - pad, b: studio.end + pad };
  });
  const view = $derived(zoom ?? full);
  const msPerPx = $derived(width > 0 ? (view.b - view.a) / width : 1);
  const x = (t: number) => (t - view.a) / msPerPx;
  const tAt = (px: number) => view.a + px * msPerPx;

  const ticks = $derived.by(() => {
    const step = TICK_STEPS.find((s) => s / msPerPx >= 70) ?? TICK_STEPS.at(-1)!;
    const out: number[] = [];
    for (let t = Math.ceil(view.a / step) * step; t <= view.b; t += step) out.push(t);
    return out;
  });

  const clipStart = (f: LoadedFlight) => (drag?.id === f.flight.id ? drag.start : f.flight.fixes[0].t);
  const duration = (f: LoadedFlight) => f.flight.fixes.at(-1)!.t - f.flight.fixes[0].t;

  /** Altitude sparkline in a 1000×100 box, about 200 points. */
  function sparkline(f: LoadedFlight): string {
    const { fixes } = f.source;
    const { minAlt, maxAlt } = f.analysis.stats;
    const span = Math.max(1, maxAlt - minAlt);
    const t0 = fixes[0].t;
    const dur = Math.max(1, fixes.at(-1)!.t - t0);
    const stride = Math.max(1, Math.floor(fixes.length / 200));
    let d = '';
    for (let i = 0; i < fixes.length; i += stride) {
      const px = ((fixes[i].t - t0) / dur) * 1000;
      const py = 96 - ((fixes[i].alt - minAlt) / span) * 88;
      d += `${d ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    }

    return d;
  }

  const rows = $derived(
    studio.flights.map((f) => ({
      f,
      path: sparkline(f),
      thermals: f.climbs.thermals.map(
        (th) => (f.source.fixes[th.start].t - f.source.fixes[0].t) / Math.max(1, duration(f))
      )
    }))
  );

  function formatNudge(ms: number): string {
    return `${ms < 0 ? '−' : '+'}${formatDuration(Math.abs(ms) / 1000)}`;
  }

  // Clip dragging -------------------------------------------------------------

  function onClipDown(e: PointerEvent, f: LoadedFlight) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const start = f.flight.fixes[0].t;
    drag = { id: f.flight.id, pointerX: e.clientX, origin: start, start, guide: null };
    studio.selectedId = f.flight.id;
  }

  function onClipMove(e: PointerEvent, f: LoadedFlight) {
    if (!drag || drag.id !== f.flight.id) return;
    const candidate = drag.origin + (e.clientX - drag.pointerX) * msPerPx;
    if (e.altKey) {
      drag = { ...drag, start: candidate, guide: null };
      return;
    }

    const targets = [studio.time];
    for (const other of studio.flights) {
      if (other.flight.id === f.flight.id) continue;
      targets.push(other.flight.fixes[0].t, other.flight.fixes.at(-1)!.t);
    }

    const snap = snapStart(candidate, duration(f), targets, SNAP_PX * msPerPx);
    drag = { ...drag, start: snap.start, guide: snap.guide };
  }

  function onClipUp(f: LoadedFlight) {
    if (!drag || drag.id !== f.flight.id) return;
    const delta = Math.round(drag.start - drag.origin);
    drag = null;
    if (Math.abs(delta) < 1000) return;
    studio.setNudge(f.flight.id, (studio.nudges[f.flight.id] ?? 0) + delta);
  }

  // Seeking on the ruler / empty track area -----------------------------------

  let scrubbing = false;
  function seekAt(e: PointerEvent, el: HTMLElement) {
    studio.seek(tAt(e.clientX - el.getBoundingClientRect().left));
  }
  function onScrubDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    scrubbing = true;
    seekAt(e, el);
  }
  function onScrubMove(e: PointerEvent) {
    if (scrubbing) seekAt(e, e.currentTarget as HTMLElement);
  }

  // Zoom (Ctrl/⌘ + wheel) and pan (wheel) -------------------------------------

  function onWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    const px = e.clientX - el.getBoundingClientRect().left;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const pivot = tAt(px);
      const factor = Math.exp(e.deltaY * 0.002);
      const span = Math.max(MIN_SPAN, Math.min(full.b - full.a, (view.b - view.a) * factor));
      const k = (pivot - view.a) / (view.b - view.a);
      zoom = span >= full.b - full.a ? null : { a: pivot - k * span, b: pivot - k * span + span };
    } else if (zoom) {
      e.preventDefault();
      const shift = (e.deltaX || e.deltaY) * msPerPx;
      const span = zoom.b - zoom.a;
      const a = Math.min(full.b - span, Math.max(full.a, zoom.a + shift));
      zoom = { a, b: a + span };
    }
  }

  // Keyboard, while the timeline has focus ------------------------------------

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) studio.redoCamera();
      else studio.undoCamera();
    } else if (mod && key === 'c') {
      editor.copy();
    } else if (mod && key === 'v') {
      e.preventDefault();
      editor.paste();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      editor.remove();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="timeline" tabindex="0" role="group" aria-label={m.timeline_label()} onkeydown={onKey}>
  <div class="head">
    <div class="modes" role="group" aria-label={m.timeline_alignment()}>
      {#each MODES as entry (entry.mode)}
        <button
          class:active={studio.syncMode === entry.mode}
          title={entry.title()}
          onclick={() => studio.setSyncMode(entry.mode)}
        >
          {entry.label()}
        </button>
      {/each}
    </div>
    <span class="hint">{m.timeline_hint()}</span>
    <button onclick={() => studio.undoCamera()} disabled={!studio.canUndoCamera} title={m.timeline_undo_title()}>
      {m.timeline_undo()}
    </button>
    <button onclick={() => studio.redoCamera()} disabled={!studio.canRedoCamera} title={m.timeline_redo_title()}>
      {m.timeline_redo()}
    </button>
    {#if zoom}<button onclick={() => (zoom = null)}>{m.timeline_fit()}</button>{/if}
  </div>

  <div class="body">
    <div class="labels">
      <div class="ruler-pad"></div>
      {#each rows as { f } (f.flight.id)}
        {@const nudge = studio.nudges[f.flight.id] ?? 0}
        <div class="label" class:selected={f.flight.id === studio.selected?.flight.id}>
          <span class="swatch" style:background={f.color}></span>
          <span class="name" title="{f.source.pilot} · {f.source.date}">
            {f.source.pilot}
            <small>{f.source.date}</small>
          </span>
          {#if nudge}
            <button class="nudge" title={m.timeline_remove_shift()} onclick={() => studio.setNudge(f.flight.id, 0)}>
              {formatNudge(nudge)} ✕
            </button>
          {/if}
        </div>
      {/each}
      <CameraLabels {studio} {editor} />
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="tracks"
      bind:clientWidth={width}
      onwheel={onWheel}
      onpointerdown={onScrubDown}
      onpointermove={onScrubMove}
      onpointerup={() => (scrubbing = false)}
      ondblclick={() => (zoom = null)}
    >
      <div class="ruler">
        {#each ticks as t (t)}
          <span class="tick" style:left="{x(t)}px">{formatClock(t).slice(0, 5)}</span>
        {/each}
      </div>

      {#each rows as { f, path, thermals } (f.flight.id)}
        {@const left = x(clipStart(f))}
        <div class="row">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="clip"
            class:selected={f.flight.id === studio.selected?.flight.id}
            class:dragging={drag?.id === f.flight.id}
            class:hidden={!f.visible}
            style:left="{left}px"
            style:width="{Math.max(4, duration(f) / msPerPx)}px"
            style:--c={f.color}
            title={m.timeline_clip_title({
              pilot: f.source.pilot,
              from: formatClock(f.source.fixes[0].t),
              to: formatClock(f.source.fixes.at(-1)!.t)
            })}
            onpointerdown={(e) => onClipDown(e, f)}
            onpointermove={(e) => onClipMove(e, f)}
            onpointerup={() => onClipUp(f)}
            onpointercancel={() => (drag = null)}
          >
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={path} />
            </svg>
            {#each thermals as k, i (i)}<span class="thermal" style:left="{k * 100}%"></span>{/each}
          </div>
        </div>
      {/each}

      <CameraLanes {studio} {editor} {x} {msPerPx} {width} {view} />

      {#if drag?.guide != null}
        <div class="guide" style:left="{x(drag.guide)}px"></div>
      {/if}
      <div class="playhead" style:left="{x(studio.time)}px"></div>
      {#if studio.exportIn != null}<div class="mark" style:left="{x(studio.exportIn)}px"></div>{/if}
      {#if studio.exportOut != null}<div class="mark" style:left="{x(studio.exportOut)}px"></div>{/if}
    </div>
  </div>
</div>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: 12px;
    user-select: none;
  }
  .timeline:focus-visible {
    outline: 1px solid var(--primary-hi);
    outline-offset: -1px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 0 4px;
  }
  .modes {
    display: flex;
  }
  .modes button {
    border-radius: 0;
    padding: 2px 8px;
    font-size: 12px;
  }
  .modes button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .modes button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .modes button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg);
  }
  .hint {
    color: var(--muted);
    margin-right: auto;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 220px 1fr;
    overflow-y: auto;
  }
  .ruler-pad,
  .ruler {
    height: 18px;
  }
  .label,
  .row {
    height: 26px;
    border-top: 1px solid var(--border);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 6px;
  }
  .label.selected {
    background: var(--surface-2);
  }
  .swatch {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .name small {
    font-weight: 400;
    color: var(--muted);
    margin-left: 4px;
  }
  .nudge {
    padding: 0 4px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .tracks {
    position: relative;
    overflow: hidden;
    cursor: text;
    touch-action: none;
  }
  .ruler {
    position: relative;
    color: var(--muted);
  }
  .tick {
    position: absolute;
    top: 0;
    padding-left: 3px;
    border-left: 1px solid var(--border);
    line-height: 18px;
    white-space: nowrap;
  }
  .row {
    position: relative;
  }
  .clip {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--c) 30%, transparent);
    border: 1px solid var(--c);
    cursor: grab;
    overflow: hidden;
    touch-action: none;
  }
  .clip.selected {
    background: color-mix(in srgb, var(--c) 45%, transparent);
    border-width: 2px;
  }
  .clip.dragging {
    cursor: grabbing;
    box-shadow:
      0 0 0 2px var(--surface),
      0 2px 8px rgba(0, 0, 0, 0.5);
    z-index: 2;
  }
  .clip.hidden {
    opacity: 0.35;
  }
  .clip svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .clip path {
    fill: none;
    stroke: #fff;
    stroke-opacity: 0.75;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .thermal {
    position: absolute;
    bottom: 0;
    width: 2px;
    height: 5px;
    background: #ff8c42;
  }
  .playhead,
  .guide {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    pointer-events: none;
    z-index: 3;
  }
  .playhead {
    background: #fff;
    opacity: 0.85;
  }
  .guide {
    background: #f2c94c;
  }
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #3987e5;
    pointer-events: none;
    z-index: 2;
  }
</style>
