<script lang="ts">
  import {
    CAMERA_PROPS,
    INTERPS,
    captureView,
    clearKeys,
    hasKeys,
    keyAt,
    removeKeys,
    setAnimated,
    setKey,
    setTrack,
    setValueAt,
    valueAt,
    type CameraProp,
    type PropTrack
  } from '#lib/domain/cameraPath';
  import { directCamera } from '#lib/domain/director';
  import type { CameraEditor } from '#lib/state/cameraEditor.svelte';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { INTERP_INFO, PROP_LABEL, nextKeyTime, prevKeyTime } from '#lib/ui/keyLanes';

  let { replay, editor }: { replay: ReplayState; editor: CameraEditor } = $props();

  const active = $derived(replay.camera === 'keys');

  /** Headings read within one turn, the others as whole numbers. */
  const shown = (prop: CameraProp, v: number) => (prop === 'heading' ? ((Math.round(v) % 360) + 360) % 360 : Math.round(v));

  function auto() {
    const sel = replay.selected;
    if (!sel) return;
    const next = directCamera(sel.flight, sel.analysis.phases, {
      inMs: replay.exportIn ?? replay.start,
      outMs: replay.exportOut ?? replay.end
    });
    if (!hasKeys(next)) {
      editor.message = 'The export range is empty, so there is nothing to direct.';
      return;
    }
    if (hasKeys(replay.cameraTracks) && !confirm('Replace the camera keys with the automatic shots?')) return;
    replay.editCamera(next);
    editor.message = `Made ${next.heading.keys.length} shots from the flight phases.`;
  }

  function capture() {
    const view = replay.captureCameraView?.();
    if (!view) {
      editor.message = 'No pilot in view to capture.';
      return;
    }
    replay.editCamera(captureView(replay.cameraTracks, view, replay.time));
  }

  function clear() {
    if (hasKeys(replay.cameraTracks) && confirm('Delete all camera keys for these flights?')) {
      replay.editCamera(clearKeys(replay.cameraTracks, replay.time));
      editor.clear();
    }
  }

  function toggleAnimated(prop: CameraProp) {
    const track = replay.cameraTracks[prop];
    const t = replay.time;
    const next = setAnimated(track, !track.animated, t, valueAt(track, t, prop));
    replay.editCamera(setTrack(replay.cameraTracks, prop, next));
  }

  /** Value field: a key at the playhead when animated, the constant otherwise. */
  function setFromField(prop: CameraProp, e: Event) {
    const n = (e.currentTarget as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(n)) return;
    const track = replay.cameraTracks[prop];
    replay.editCamera(setTrack(replay.cameraTracks, prop, setValueAt(track, prop, replay.time, n)));
  }

  /** Diamond button: adds a key at the playhead, or removes the one there. */
  function togglePlayheadKey(prop: CameraProp) {
    const track = replay.cameraTracks[prop];
    const t = replay.time;
    let next: PropTrack;
    if (!track.animated) next = setAnimated(track, true, t, valueAt(track, t, prop));
    else {
      const at = keyAt(track, t);
      next = at ? removeKeys(track, new Set([at.t])) : setKey(track, prop, t, valueAt(track, t, prop));
    }
    replay.editCamera(setTrack(replay.cameraTracks, prop, next));
  }
</script>

<div class="cam-row head-row">
  <button
    class="twirl"
    aria-expanded={editor.expanded}
    aria-label={editor.expanded ? 'Collapse camera keys' : 'Expand camera keys'}
    onclick={() => (editor.expanded = !editor.expanded)}
  >
    {editor.expanded ? '▾' : '▸'}
  </button>
  <span class="title">Camera</span>
  <button onclick={auto} title="Direct keys from the flight phases of the selected pilot over the export range">Auto</button>
  <button
    onclick={capture}
    disabled={!replay.captureCameraView}
    title="Keys heading, pitch and range from the current 3D view at the playhead"
  >
    Capture view
  </button>
  <button onclick={clear} title="Delete all camera keys">Clear</button>
</div>

{#if editor.live.length}
  <div class="cam-row bar" role="group" aria-label="Selected keys">
    {#each INTERPS as interp (interp)}
      <button title={INTERP_INFO[interp].title} onclick={() => editor.setInterp(interp)}>{INTERP_INFO[interp].label}</button>
    {/each}
    <button title="Delete selected keys (Delete)" onclick={() => editor.remove()}>Delete</button>
  </div>
{/if}

{#if editor.expanded}
  {#each CAMERA_PROPS as prop (prop)}
    {@const track = replay.cameraTracks[prop]}
    {@const label = PROP_LABEL[prop]}
    {@const v = valueAt(track, replay.time, prop)}
    {@const atPlayhead = track.animated && !!keyAt(track, replay.time)}
    {@const prev = prevKeyTime(track.keys, replay.time)}
    {@const next = nextKeyTime(track.keys, replay.time)}
    <div class="cam-row lane" class:dim={!active}>
      <button
        class="stopwatch"
        class:on={track.animated}
        aria-pressed={track.animated}
        aria-label="Animate {label}"
        title="Animate {label.toLowerCase()}: keys at the playhead change over time"
        onclick={() => toggleAnimated(prop)}
      >
        <span></span>
      </button>
      <label class="name" for="cam-{prop}">{label}</label>
      <input
        id="cam-{prop}"
        type="number"
        step="any"
        value={shown(prop, v)}
        title="Value at the playhead"
        onchange={(e) => setFromField(prop, e)}
      />
      <span class="nav">
        <button aria-label="Previous {label.toLowerCase()} key" title="Previous key" disabled={prev === undefined} onclick={() => replay.seek(prev!)}>‹</button>
        <button
          class="diamond"
          class:filled={atPlayhead}
          aria-pressed={atPlayhead}
          aria-label="{atPlayhead ? 'Remove' : 'Add'} {label.toLowerCase()} key at playhead"
          title="{atPlayhead ? 'Remove key at playhead' : 'Add key at playhead'}"
          onclick={() => togglePlayheadKey(prop)}
        ></button>
        <button aria-label="Next {label.toLowerCase()} key" title="Next key" disabled={next === undefined} onclick={() => replay.seek(next!)}>›</button>
      </span>
    </div>
  {/each}
{:else}
  <div class="cam-row summary-label"><span class="muted">All keys</span></div>
{/if}

<style>
  .cam-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding-right: 6px;
    box-shadow: inset 0 1px 0 var(--border);
    overflow: hidden;
    white-space: nowrap;
  }
  .cam-row button {
    padding: 0 5px;
    font-size: 11px;
    line-height: 18px;
  }
  .title {
    font-weight: 600;
    margin-right: auto;
  }
  .twirl {
    padding: 0 3px !important;
    border: 0;
    background: none;
  }
  .bar {
    background: var(--surface-2);
  }
  .lane.dim,
  .summary-label {
    opacity: 0.6;
  }
  .lane .name {
    width: 46px;
    color: var(--muted);
  }
  .lane input {
    width: 58px;
    min-width: 0;
    padding: 0 4px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .lane .nav {
    display: flex;
    margin-left: auto;
  }
  .lane .nav button {
    padding: 0 3px;
    border-radius: 0;
    line-height: 18px;
  }
  .stopwatch {
    padding: 0 3px !important;
    border: 0;
    background: none;
  }
  .stopwatch span {
    display: block;
    width: 9px;
    height: 9px;
    border: 1.5px solid var(--muted);
    border-radius: 50%;
  }
  .stopwatch.on span {
    background: #f2c94c;
    border-color: #f2c94c;
  }
  .diamond {
    width: 10px;
    height: 10px;
    margin: 0 4px;
    padding: 0 !important;
    align-self: center;
    border: 1.5px solid #f2c94c;
    border-radius: 1px;
    background: none;
    transform: rotate(45deg);
  }
  .diamond.filled {
    background: #f2c94c;
  }
  .muted {
    color: var(--muted);
  }
</style>
