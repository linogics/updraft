<script lang="ts">
  import { EXAGGERATION } from '#lib/domain/scene';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import Popover from './Popover.svelte';

  let { replay }: { replay: ReplayState } = $props();
</script>

<Popover label="View">
  <div class="fields">
    <label for="view-exag">Height</label>
    <span class="range">
      <input
        id="view-exag"
        type="range"
        min={EXAGGERATION.min}
        max={EXAGGERATION.max}
        step={EXAGGERATION.step}
        bind:value={replay.exaggeration}
      />
      <output for="view-exag">{replay.exaggeration.toFixed(1)}×</output>
    </span>
    <label for="view-sun">Sun lighting</label>
    <input id="view-sun" type="checkbox" bind:checked={replay.lighting} />
    <label for="view-labels">Pilot names</label>
    <input id="view-labels" type="checkbox" bind:checked={replay.labels} />
  </div>
  <p class="hint">3D only. The sun follows the selected pilot's recorded time.</p>
</Popover>

<style>
  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    justify-items: start;
    gap: 6px 10px;
  }
  label {
    color: var(--muted);
  }
  .range {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-self: stretch;
  }
  .range input {
    flex: 1;
    min-width: 0;
  }
  output {
    width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 8px 0 0;
    max-width: 240px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
