<script lang="ts">
  import { snapStart, type SyncMode } from '#lib/domain/sync';
  import type { LoadedFlight, ReplayState } from '#lib/state/replay.svelte';
  import { formatClock, formatDuration } from '#lib/ui/format';

  let { replay }: { replay: ReplayState } = $props();

  const SNAP_PX = 8;
  const MIN_SPAN = 60_000;
  const MODES: { mode: SyncMode; label: string; title: string }[] = [
    { mode: 'real', label: 'Real time', title: 'Every flight at its recorded date and time' },
    { mode: 'timeOfDay', label: 'Same day', title: 'Move all flights onto one day, keeping their time of day' },
    { mode: 'takeoff', label: 'Align takeoffs', title: 'Start all flights at the same moment' }
  ];
  const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * 60_000);

  let width = $state(0);
  /** Visible time window; null fits all flights. */
  let zoom = $state<{ a: number; b: number } | null>(null);
  /** Clip being dragged: preview start replaces the committed one until pointer-up. */
  let drag = $state<{ id: string; pointerX: number; origin: number; start: number; guide: number | null } | null>(null);

  const full = $derived.by(() => {
    const pad = Math.max((replay.end - replay.start) * 0.03, 30_000);
    return { a: replay.start - pad, b: replay.end + pad };
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
    replay.flights.map((f) => ({
      f,
      path: sparkline(f),
      thermals: f.climbs.thermals.map((th) => (f.source.fixes[th.start].t - f.source.fixes[0].t) / Math.max(1, duration(f)))
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
    replay.selectedId = f.flight.id;
  }

  function onClipMove(e: PointerEvent, f: LoadedFlight) {
    if (!drag || drag.id !== f.flight.id) return;
    const candidate = drag.origin + (e.clientX - drag.pointerX) * msPerPx;
    if (e.altKey) {
      drag = { ...drag, start: candidate, guide: null };
      return;
    }
    const targets = [replay.time];
    for (const other of replay.flights) {
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
    replay.setNudge(f.flight.id, (replay.nudges[f.flight.id] ?? 0) + delta);
  }

  // Seeking on the ruler / empty track area -----------------------------------

  let scrubbing = false;
  function seekAt(e: PointerEvent, el: HTMLElement) {
    replay.seek(tAt(e.clientX - el.getBoundingClientRect().left));
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
</script>

<div class="timeline">
  <div class="head">
    <div class="modes" role="group" aria-label="Flight alignment">
      {#each MODES as m (m.mode)}
        <button class:active={replay.syncMode === m.mode} title={m.title} onclick={() => replay.setSyncMode(m.mode)}>
          {m.label}
        </button>
      {/each}
    </div>
    <span class="hint">Drag clips to shift · Alt: no snapping · Ctrl+wheel: zoom</span>
    {#if zoom}<button onclick={() => (zoom = null)}>Fit</button>{/if}
  </div>

  <div class="body">
    <div class="labels">
      <div class="ruler-pad"></div>
      {#each rows as { f } (f.flight.id)}
        {@const nudge = replay.nudges[f.flight.id] ?? 0}
        <div class="label" class:selected={f.flight.id === replay.selected?.flight.id}>
          <span class="swatch" style:background={f.color}></span>
          <span class="name" title="{f.source.pilot} · {f.source.date}">
            {f.source.pilot}
            <small>{f.source.date}</small>
          </span>
          {#if nudge}
            <button class="nudge" title="Remove manual shift" onclick={() => replay.setNudge(f.flight.id, 0)}>
              {formatNudge(nudge)} ✕
            </button>
          {/if}
        </div>
      {/each}
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
            class:selected={f.flight.id === replay.selected?.flight.id}
            class:dragging={drag?.id === f.flight.id}
            class:hidden={!f.visible}
            style:left="{left}px"
            style:width="{Math.max(4, duration(f) / msPerPx)}px"
            style:--c={f.color}
            title="{f.source.pilot}: {formatClock(f.source.fixes[0].t)}–{formatClock(f.source.fixes.at(-1)!.t)} recorded"
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

      {#if drag?.guide != null}
        <div class="guide" style:left="{x(drag.guide)}px"></div>
      {/if}
      <div class="playhead" style:left="{x(replay.time)}px"></div>
      {#if replay.exportIn != null}<div class="mark" style:left="{x(replay.exportIn)}px"></div>{/if}
      {#if replay.exportOut != null}<div class="mark" style:left="{x(replay.exportOut)}px"></div>{/if}
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
    background: #3987e5;
    border-color: #3987e5;
    color: #fff;
  }
  .hint {
    color: var(--muted);
    margin-right: auto;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 170px 1fr;
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
    box-shadow: 0 0 0 2px var(--surface), 0 2px 8px rgba(0, 0, 0, 0.5);
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
