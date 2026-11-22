<script lang="ts">
  import { CAMERA_PROPS, keyAt, toLane, type CameraProp, type KeyRef } from '#lib/domain/cameraPath';
  import type { CameraEditor } from '#lib/state/cameraEditor.svelte';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import {
    INTERP_INFO,
    PROP_LABEL,
    ROW_PX,
    SNAP_PX,
    keyTimes,
    keysInBox,
    laneCurve,
    laneDelta,
    mergeRefs,
    snapTime,
    valueY,
    type Box,
    type LanePoint,
    type Scale
  } from '#lib/ui/keyLanes';
  import { formatClock } from '#lib/ui/format';

  let { replay, editor, x, msPerPx, width, view }: {
    replay: ReplayState;
    editor: CameraEditor;
    /** Time to px, as the clips use it. */
    x: (t: number) => number;
    msPerPx: number;
    width: number;
    view: { a: number; b: number };
  } = $props();

  /** Drag of picked keys. Horizontal moves time, vertical changes the value of one lane. */
  interface Drag {
    refs: KeyRef[];
    anchor: KeyRef;
    /** Selection that a click without movement leaves. */
    collapse: KeyRef[];
    x0: number;
    y0: number;
    /** Scale of the pressed lane, null on the collapsed summary. */
    scale: Scale | null;
    axis: 'x' | 'y' | null;
    dt: number;
    dv: number;
    guide: number | null;
  }
  let drag = $state<Drag | null>(null);
  let marquee = $state<(Box & { base: KeyRef[] }) | null>(null);
  let area: HTMLElement;

  const tracks = $derived(replay.cameraTracks);
  const active = $derived(replay.camera === 'keys');
  const lanes = $derived(
    editor.expanded && width > 0
      ? CAMERA_PROPS.map((prop) => ({ prop, ...laneCurve(prop, tracks[prop], view.a, view.b, width) }))
      : []
  );
  /** Collapsed view: one diamond per time, grouping the props with a key there. */
  const summary = $derived(
    keyTimes(tracks).map((t) => ({ t, props: CAMERA_PROPS.filter((p) => keyAt(tracks[p], t)) }))
  );
  const points = $derived.by<LanePoint[]>(() =>
    editor.expanded
      ? lanes.flatMap((lane, i) =>
          tracks[lane.prop].keys.map((k) => ({
            prop: lane.prop,
            t: k.t,
            x: x(k.t),
            y: i * ROW_PX + valueY(toLane(lane.prop, k.v), lane.scale, ROW_PX)
          }))
        )
      : summary.flatMap((s) => s.props.map((prop) => ({ prop, t: s.t, x: x(s.t), y: ROW_PX / 2 })))
  );

  /** Drag offset of a key while it moves, so the diamonds follow the pointer. */
  function shiftOf(prop: CameraProp, t: number): { dt: number; dv: number } {
    const d = drag;
    if (!d || d.axis === null || !d.refs.some((r) => r.prop === prop && r.t === t)) return { dt: 0, dv: 0 };
    return {
      dt: d.axis === 'x' ? d.dt : 0,
      dv: d.axis === 'y' && d.anchor.prop === prop ? d.dv : 0
    };
  }

  function snapTargets(moving: KeyRef[]): number[] {
    const out = [replay.time];
    for (const p of CAMERA_PROPS) {
      for (const k of tracks[p].keys) {
        if (!moving.some((r) => r.prop === p && r.t === k.t)) out.push(k.t);
      }
    }
    return out;
  }

  function onKeyDown(e: PointerEvent, refs: KeyRef[], scale: Scale | null) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) {
      editor.toggle(refs);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const anchor = refs[0];
    const moving = editor.isOn(anchor) ? editor.live : refs;
    if (!editor.isOn(anchor)) editor.select(refs);
    drag = { refs: moving, anchor, collapse: refs, x0: e.clientX, y0: e.clientY, scale, axis: null, dt: 0, dv: 0, guide: null };
  }

  function onKeyMove(e: PointerEvent) {
    const d = drag;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    let axis = d.axis;
    if (axis === null && Math.max(Math.abs(dx), Math.abs(dy)) > 3) {
      axis = d.scale && Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }
    if (axis === 'x') {
      const candidate = d.anchor.t + dx * msPerPx;
      const snap = e.altKey ? { t: candidate, guide: null } : snapTime(candidate, snapTargets(d.refs), SNAP_PX * msPerPx);
      drag = { ...d, axis, dt: snap.t - d.anchor.t, guide: snap.guide };
    } else if (axis === 'y' && d.scale) {
      drag = { ...d, axis, dv: laneDelta(dy, d.scale, ROW_PX) };
    }
  }

  function onKeyUp() {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.axis === null) editor.select(d.collapse);
    else if (d.axis === 'x') editor.move(d.dt);
    else if (d.scale) editor.shiftValues(d.anchor.prop, d.dv);
  }

  /** Pointer position relative to the lane area. */
  function localPoint(e: PointerEvent) {
    const r = area.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onAreaDown(e: PointerEvent) {
    if (e.button !== 0) return;
    // Empty lane space selects by marquee and must not move the playhead.
    e.stopPropagation();
    area.setPointerCapture(e.pointerId);
    const { x: px, y: py } = localPoint(e);
    marquee = { x0: px, y0: py, x1: px, y1: py, base: e.shiftKey ? editor.live : [] };
    if (!e.shiftKey) editor.clear();
  }

  function onAreaMove(e: PointerEvent) {
    const m = marquee;
    if (!m) return;
    const { x: px, y: py } = localPoint(e);
    marquee = { ...m, x1: px, y1: py };
    editor.select(mergeRefs(m.base, keysInBox(points, { x0: m.x0, y0: m.y0, x1: px, y1: py })));
  }
</script>

<div class="cam-head" role="presentation" onpointerdown={(e) => e.stopPropagation()}>
  {#if editor.message}<span class="msg" role="status">{editor.message}</span>{/if}
  {#if !active}
    <span class="hint">Camera keys inactive</span>
    <button onclick={() => (replay.camera = 'keys')}>Use</button>
  {/if}
</div>

{#if editor.live.length}<div class="cam-spacer"></div>{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="cam-lanes"
  class:dim={!active}
  bind:this={area}
  onpointerdown={onAreaDown}
  onpointermove={onAreaMove}
  onpointerup={() => (marquee = null)}
  onpointercancel={() => (marquee = null)}
>
  {#if editor.expanded}
    {#each lanes as lane (lane.prop)}
      <div class="cam-row">
        <svg class="curve" viewBox="0 0 {width} {ROW_PX}" preserveAspectRatio="none" aria-hidden="true">
          <path d={lane.d} />
        </svg>
        {#each tracks[lane.prop].keys as k (k.t)}
          {@const s = shiftOf(lane.prop, k.t)}
          {@const sel = editor.isOn({ prop: lane.prop, t: k.t })}
          <button
            type="button"
            tabindex="-1"
            class="key {k.interp}"
            class:sel
            aria-pressed={sel}
            aria-label="{PROP_LABEL[lane.prop]} key at {formatClock(k.t)}, {INTERP_INFO[k.interp].label}"
            title="{PROP_LABEL[lane.prop]} {INTERP_INFO[k.interp].title.toLowerCase()}"
            style:left="{x(k.t + s.dt)}px"
            style:top="{valueY(toLane(lane.prop, k.v) + s.dv, lane.scale, ROW_PX)}px"
            onpointerdown={(e) => onKeyDown(e, [{ prop: lane.prop, t: k.t }], lane.scale)}
            onpointermove={onKeyMove}
            onpointerup={onKeyUp}
            onpointercancel={() => (drag = null)}
          ></button>
        {/each}
      </div>
    {/each}
  {:else}
    <div class="cam-row">
      {#each summary as s (s.t)}
        {@const sh = shiftOf(s.props[0], s.t)}
        {@const sel = s.props.some((p) => editor.isOn({ prop: p, t: s.t }))}
        <button
          type="button"
          tabindex="-1"
          class="key summary"
          class:sel
          aria-pressed={sel}
          aria-label="Keys at {formatClock(s.t)}"
          title="Keys at {formatClock(s.t)}: {s.props.map((p) => PROP_LABEL[p]).join(', ')}"
          style:left="{x(s.t + sh.dt)}px"
          style:top="{ROW_PX / 2}px"
          onpointerdown={(e) => onKeyDown(e, s.props.map((p) => ({ prop: p, t: s.t })), null)}
          onpointermove={onKeyMove}
          onpointerup={onKeyUp}
          onpointercancel={() => (drag = null)}
        ></button>
      {/each}
    </div>
  {/if}

  {#if drag?.guide != null}<div class="guide" style:left="{x(drag.guide)}px"></div>{/if}
  {#if marquee}
    <div
      class="marquee"
      style:left="{Math.min(marquee.x0, marquee.x1)}px"
      style:top="{Math.min(marquee.y0, marquee.y1)}px"
      style:width="{Math.abs(marquee.x1 - marquee.x0)}px"
      style:height="{Math.abs(marquee.y1 - marquee.y0)}px"
    ></div>
  {/if}
</div>

<style>
  .cam-head {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 26px;
    padding: 0 6px;
    box-shadow: inset 0 1px 0 var(--border);
    overflow: hidden;
    white-space: nowrap;
    font-size: 11px;
  }
  .cam-head button {
    padding: 0 6px;
    font-size: 11px;
    line-height: 18px;
  }
  .msg {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    color: var(--muted);
  }
  .cam-spacer {
    height: 26px;
    box-shadow: inset 0 1px 0 var(--border);
  }
  .cam-lanes {
    position: relative;
    touch-action: none;
  }
  .cam-lanes.dim {
    opacity: 0.55;
  }
  .cam-row {
    position: relative;
    height: 26px;
    box-shadow: inset 0 1px 0 var(--border);
  }
  .curve {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .curve path {
    fill: none;
    stroke: #f2c94c;
    stroke-opacity: 0.8;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .key {
    position: absolute;
    z-index: 2;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    padding: 0;
    border: 1px solid #f2c94c;
    background: #f2c94c;
    cursor: grab;
  }
  .key:active {
    cursor: grabbing;
  }
  .key.summary,
  .key.linear,
  .key.ease {
    transform: rotate(45deg);
  }
  .key.auto {
    border-radius: 50%;
  }
  .key.linear,
  .key.summary {
    border-radius: 1px;
  }
  .key.hold {
    border-radius: 0;
  }
  .key.ease {
    border-radius: 30%;
  }
  .key.sel {
    background: #fff;
    border-color: #fff;
    box-shadow: 0 0 0 1px #f2c94c;
  }
  .guide {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: #f2c94c;
    pointer-events: none;
    z-index: 3;
  }
  .marquee {
    position: absolute;
    z-index: 4;
    border: 1px dashed #fff;
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }
</style>
