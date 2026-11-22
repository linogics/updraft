<script lang="ts">
  import { MAX_KEYS } from '#lib/domain/cameraPath';
  import { directCamera } from '#lib/domain/director';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { formatClock } from '#lib/ui/format';

  let { replay }: { replay: ReplayState } = $props();

  let message = $state('');
  const keys = $derived(replay.keyframes);
  const full = $derived(keys.length >= MAX_KEYS);
  /** Headings are stored unwrapped, so show them within one turn. */
  const compass = (h: number) => ((Math.round(h) % 360) + 360) % 360;

  function auto() {
    const loaded = replay.selected;
    if (!loaded) return;
    const shots = directCamera(loaded.flight, loaded.analysis.phases, {
      inMs: replay.exportIn ?? replay.start,
      outMs: replay.exportOut ?? replay.end
    });
    if (!shots.length) {
      message = 'The export range is empty, so there is nothing to direct.';
      return;
    }
    if (keys.length && !confirm('Replace the current camera keys with the automatic shots?')) return;
    replay.setKeyframes(shots);
    replay.camera = 'keys';
    message = `Made ${shots.length} shots from the flight phases.`;
  }

  function add() {
    const key = replay.captureCameraKey?.();
    if (!key) {
      message = 'Wait for the 3D view to load.';
      return;
    }
    if (!replay.addKeyframe(key)) message = `Up to ${MAX_KEYS} keys.`;
  }

  function clearAll() {
    if (confirm('Delete all camera keys for these flights?')) replay.setKeyframes([]);
  }
</script>

<div class="keys">
  <div class="actions">
    <button onclick={auto}>Auto from phases</button>
    <button onclick={add} disabled={!replay.captureCameraKey || full}>Add at current time</button>
  </div>
  <p class="hint">Position the camera in free mode, then add.</p>

  {#if keys.length}
    <ol class="list">
      {#each keys as k, i (i)}
        <li>
          <span class="time">{formatClock(k.t)}</span>
          <button class="go" onclick={() => replay.seek(k.t)} aria-label="Go to {formatClock(k.t)}">Go</button>
          <div class="fields">
            <label for="key-{i}-heading">Heading</label>
            <input
              id="key-{i}-heading"
              type="number"
              min="0"
              max="359"
              step="1"
              value={compass(k.heading)}
              onchange={(e) => replay.updateKeyframe(i, { heading: e.currentTarget.valueAsNumber })}
            />
            <label for="key-{i}-pitch">Pitch</label>
            <input
              id="key-{i}-pitch"
              type="number"
              min="-89"
              max="0"
              step="1"
              value={Math.round(k.pitch)}
              onchange={(e) => replay.updateKeyframe(i, { pitch: e.currentTarget.valueAsNumber })}
            />
            <label for="key-{i}-range">Range (m)</label>
            <input
              id="key-{i}-range"
              type="number"
              min="40"
              max="20000"
              step="10"
              value={Math.round(k.range)}
              onchange={(e) => replay.updateKeyframe(i, { range: e.currentTarget.valueAsNumber })}
            />
          </div>
          <button class="delete" onclick={() => replay.removeKeyframe(i)} aria-label="Delete key at {formatClock(k.t)}">×</button>
        </li>
      {/each}
    </ol>
    <div class="footer">
      <span class="count">{keys.length} of {MAX_KEYS}</span>
      <button onclick={clearAll}>Clear all</button>
    </div>
  {:else}
    <p class="hint">No camera keys yet.</p>
  {/if}

  {#if message}<p class="message" role="status">{message}</p>{/if}
</div>

<style>
  .keys {
    display: grid;
    gap: 8px;
    width: 300px;
  }
  .actions,
  .footer {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: space-between;
  }
  .hint,
  .message,
  .count {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 6px;
    align-items: center;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .time {
    font-variant-numeric: tabular-nums;
  }
  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 6px;
    align-items: center;
  }
  .fields label {
    color: var(--muted);
    font-size: 12px;
  }
  .fields input {
    width: 100%;
    min-width: 0;
  }
  .delete {
    padding: 0 8px;
  }
</style>
