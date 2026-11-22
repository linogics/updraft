<script lang="ts">
  import { COLOR_MODES, TRACK_STYLES, TRACK_WIDTH } from '#lib/domain/scene';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import Popover from './Popover.svelte';

  let { replay }: { replay: ReplayState } = $props();

  const COLOR_LABELS = { vario: 'Vario', phase: 'Phase', climb: 'Climb / transition', pilot: 'Pilot' } as const;
  const STYLE_LABELS = { solid: 'Solid', outline: 'Outline', dashed: 'Dashed', curtain: 'Curtain (3D)', glow: 'Glow' } as const;
</script>

<Popover label="Track">
  <div class="fields">
    <label for="track-color">Colour</label>
    <select id="track-color" bind:value={replay.colorBy}>
      {#each COLOR_MODES as m (m)}<option value={m}>{COLOR_LABELS[m]}</option>{/each}
    </select>

    <label for="track-style">Style</label>
    <select id="track-style" bind:value={replay.trackStyle}>
      {#each TRACK_STYLES as s (s)}<option value={s}>{STYLE_LABELS[s]}</option>{/each}
    </select>

    <label for="track-width">Width</label>
    <span class="width">
      <input id="track-width" type="range" min={TRACK_WIDTH.min} max={TRACK_WIDTH.max} step="1" bind:value={replay.trackWidth} />
      <output for="track-width">{replay.trackWidth} px</output>
    </span>

    <span></span>
    <label class="check"><input type="checkbox" bind:checked={replay.smoothTrack} /> Smooth</label>
  </div>
  {#if replay.trackStyle === 'glow' && replay.colorBy !== 'pilot'}
    <p class="hint">In 3D, glow needs the pilot colour; other colour modes draw solid.</p>
  {:else if replay.trackStyle === 'curtain'}
    <p class="hint">The curtain is a 3D effect; the 2D map draws solid.</p>
  {/if}
  <p class="hint">Click a pilot's colour dot to change their colour.</p>
</Popover>

<style>
  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 10px;
  }
  label {
    color: var(--muted);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    color: inherit;
  }
  .width {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .width input {
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
