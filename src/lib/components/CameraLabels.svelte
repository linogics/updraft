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
  import { DENSITIES, directCamera, type Density } from '#lib/domain/director';
  import type { CameraEditor } from '#lib/state/cameraEditor.svelte';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { m } from '#lib/paraglide/messages';
  import { INTERP_INFO, PROP_LABEL, nextKeyTime, prevKeyTime } from '#lib/ui/keyLanes';

  let { studio, editor }: { studio: StudioState; editor: CameraEditor } = $props();

  const DENSITY_LABELS: Record<Density, () => string> = {
    low: () => m.density_low(),
    mid: () => m.density_mid(),
    high: () => m.density_high()
  };

  let density = $state<Density>('low');

  const active = $derived(studio.camera === 'keys');

  /** Headings read within one turn, the others as whole numbers. */
  const shown = (prop: CameraProp, v: number) =>
    prop === 'heading' ? ((Math.round(v) % 360) + 360) % 360 : Math.round(v);

  function auto() {
    const sel = studio.selected;
    if (!sel) return;
    const next = directCamera(
      sel.flight,
      sel.analysis.phases,
      {
        inMs: studio.exportIn ?? studio.start,
        outMs: studio.exportOut ?? studio.end
      },
      density
    );
    if (!hasKeys(next)) {
      editor.message = m.camera_range_empty();
      return;
    }
    if (hasKeys(studio.cameraTracks) && !confirm(m.camera_confirm_replace())) return;
    studio.editCamera(next);
    editor.message = m.camera_made_shots({ count: next.heading.keys.length });
  }

  function capture() {
    const view = studio.captureCameraView?.();
    if (!view) {
      editor.message = m.camera_no_pilot();
      return;
    }
    studio.editCamera(captureView(studio.cameraTracks, view, studio.time));
  }

  function clear() {
    if (hasKeys(studio.cameraTracks) && confirm(m.camera_confirm_clear())) {
      studio.editCamera(clearKeys(studio.cameraTracks, studio.time));
      editor.clear();
    }
  }

  function toggleAnimated(prop: CameraProp) {
    const track = studio.cameraTracks[prop];
    const t = studio.time;
    const next = setAnimated(track, !track.animated, t, valueAt(track, t, prop));
    studio.editCamera(setTrack(studio.cameraTracks, prop, next));
  }

  /** Value field: a key at the playhead when animated, the constant otherwise. */
  function setFromField(prop: CameraProp, e: Event) {
    const n = (e.currentTarget as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(n)) return;
    const track = studio.cameraTracks[prop];
    studio.editCamera(setTrack(studio.cameraTracks, prop, setValueAt(track, prop, studio.time, n)));
  }

  /** Diamond button: adds a key at the playhead, or removes the one there. */
  function togglePlayheadKey(prop: CameraProp) {
    const track = studio.cameraTracks[prop];
    const t = studio.time;
    let next: PropTrack;
    if (!track.animated) next = setAnimated(track, true, t, valueAt(track, t, prop));
    else {
      const at = keyAt(track, t);
      next = at ? removeKeys(track, new Set([at.t])) : setKey(track, prop, t, valueAt(track, t, prop));
    }
    studio.editCamera(setTrack(studio.cameraTracks, prop, next));
  }
</script>

<div class="cam-row head-row">
  <button
    class="twirl"
    aria-expanded={editor.expanded}
    aria-label={editor.expanded ? m.camera_collapse_keys() : m.camera_expand_keys()}
    onclick={() => (editor.expanded = !editor.expanded)}
  >
    {editor.expanded ? '▾' : '▸'}
  </button>
  <span class="title">{m.toolbar_camera()}</span>
  <button onclick={auto} title={m.camera_auto_title()}>{m.camera_auto()}</button>
  <select aria-label={m.camera_density()} title={m.camera_density_title()} bind:value={density}>
    {#each DENSITIES as d (d)}
      <option value={d}>{DENSITY_LABELS[d]()}</option>
    {/each}
  </select>
  <button onclick={capture} disabled={!studio.captureCameraView} title={m.camera_capture_title()}>
    {m.camera_capture()}
  </button>
  <button onclick={clear} title={m.camera_clear_title()}>{m.camera_clear()}</button>
</div>

{#if editor.live.length}
  <div class="cam-row bar" role="group" aria-label={m.camera_selected_keys()}>
    {#each INTERPS as interp (interp)}
      <button title={INTERP_INFO[interp].title()} onclick={() => editor.setInterp(interp)}>
        {INTERP_INFO[interp].label()}
      </button>
    {/each}
    <button title={m.camera_delete_selected()} onclick={() => editor.remove()}>{m.common_delete()}</button>
  </div>
{/if}

{#if editor.expanded}
  {#each CAMERA_PROPS as prop (prop)}
    {@const track = studio.cameraTracks[prop]}
    {@const label = PROP_LABEL[prop]()}
    {@const v = valueAt(track, studio.time, prop)}
    {@const atPlayhead = track.animated && !!keyAt(track, studio.time)}
    {@const prev = prevKeyTime(track.keys, studio.time)}
    {@const next = nextKeyTime(track.keys, studio.time)}
    <div class="cam-row lane" class:dim={!active}>
      <button
        class="stopwatch"
        class:on={track.animated}
        aria-pressed={track.animated}
        aria-label={m.camera_animate({ prop: label })}
        title={m.camera_animate_title({ prop: label })}
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
        title={m.camera_value_title()}
        onchange={(e) => setFromField(prop, e)}
      />
      <span class="nav">
        <button
          aria-label={m.camera_prev_key_aria({ prop: label })}
          title={m.camera_prev_key()}
          disabled={prev === undefined}
          onclick={() => studio.seek(prev!)}
        >
          ‹
        </button>
        <button
          class="diamond"
          class:filled={atPlayhead}
          aria-pressed={atPlayhead}
          aria-label={atPlayhead
            ? m.camera_remove_diamond_aria({ prop: label })
            : m.camera_add_diamond_aria({ prop: label })}
          title={atPlayhead ? m.camera_remove_key_title() : m.camera_add_key_title()}
          onclick={() => togglePlayheadKey(prop)}
        ></button>
        <button
          aria-label={m.camera_next_key_aria({ prop: label })}
          title={m.camera_next_key()}
          disabled={next === undefined}
          onclick={() => studio.seek(next!)}
        >
          ›
        </button>
      </span>
    </div>
  {/each}
{:else}
  <div class="cam-row summary-label"><span class="muted">{m.camera_all_keys()}</span></div>
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
  .cam-row select {
    font-size: 11px;
    height: 18px;
    padding: 0 2px;
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
    background: var(--primary-hi);
    border-color: var(--primary-hi);
  }
  .diamond {
    width: 10px;
    height: 10px;
    margin: 0 4px;
    padding: 0 !important;
    align-self: center;
    border: 1.5px solid var(--primary-hi);
    border-radius: 1px;
    background: none;
    transform: rotate(45deg);
  }
  .diamond.filled {
    background: var(--primary-hi);
  }
  .muted {
    color: var(--muted);
  }
</style>
