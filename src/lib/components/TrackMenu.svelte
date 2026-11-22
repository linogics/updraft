<script lang="ts">
  import { COLOR_MODES, TRACK_STYLES, TRACK_WIDTH } from '#lib/domain/scene';
  import { m } from '#lib/paraglide/messages';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import Popover from './Popover.svelte';

  let { replay }: { replay: ReplayState } = $props();

  const COLOR_LABELS = {
    vario: () => m.track_color_vario(),
    phase: () => m.track_color_phase(),
    climb: () => m.track_color_climb(),
    pilot: () => m.track_color_pilot()
  } as const;
  const STYLE_LABELS = {
    solid: () => m.track_style_solid(),
    outline: () => m.track_style_outline(),
    dashed: () => m.track_style_dashed(),
    curtain: () => m.track_style_curtain(),
    glow: () => m.track_style_glow()
  } as const;
</script>

<Popover label={m.track_menu()}>
  <div class="fields">
    <label for="track-color">{m.track_colour()}</label>
    <select id="track-color" bind:value={replay.colorBy}>
      {#each COLOR_MODES as mode (mode)}<option value={mode}>{COLOR_LABELS[mode]()}</option>{/each}
    </select>

    <label for="track-style">{m.track_style()}</label>
    <select id="track-style" bind:value={replay.trackStyle}>
      {#each TRACK_STYLES as s (s)}<option value={s}>{STYLE_LABELS[s]()}</option>{/each}
    </select>

    <label for="track-width">{m.track_width()}</label>
    <span class="width">
      <input
        id="track-width"
        type="range"
        min={TRACK_WIDTH.min}
        max={TRACK_WIDTH.max}
        step="1"
        bind:value={replay.trackWidth}
      />
      <output for="track-width">{replay.trackWidth} px</output>
    </span>

    <span></span>
    <label class="check"><input type="checkbox" bind:checked={replay.smoothTrack} /> {m.track_smooth()}</label>
  </div>
  {#if replay.trackStyle === 'glow' && replay.colorBy !== 'pilot'}
    <p class="hint">{m.track_hint_glow()}</p>
  {:else if replay.trackStyle === 'curtain'}
    <p class="hint">{m.track_hint_curtain()}</p>
  {/if}
  <p class="hint">{m.track_hint_dot()}</p>
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
