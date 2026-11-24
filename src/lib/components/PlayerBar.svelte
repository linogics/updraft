<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { SPEEDS, type StudioState } from '#lib/state/studio.svelte';
  import { formatClock, formatDuration } from '#lib/ui/format';

  let { studio }: { studio: StudioState } = $props();
</script>

<div class="player">
  <button class="play" onclick={() => studio.toggle()} aria-label={studio.playing ? m.player_pause() : m.player_play()}>
    {studio.playing ? '❚❚' : '▶'}
  </button>
  <select bind:value={studio.speed} aria-label={m.player_speed()}>
    {#each SPEEDS as s (s)}<option value={s}>{s}×</option>{/each}
  </select>
  <button onclick={() => studio.nextThermal()} title={m.player_next_thermal_title()}>{m.player_next_thermal()}</button>
  <span class="clock">{formatClock(studio.time)}</span>
  <input
    type="range"
    min={studio.start}
    max={studio.end}
    step={1000}
    value={studio.time}
    oninput={(e) => studio.seek(Number(e.currentTarget.value))}
    aria-label={m.player_position()}
  />
  <span class="elapsed">
    {formatDuration((studio.time - studio.start) / 1000)} / {formatDuration((studio.end - studio.start) / 1000)}
  </span>
</div>

<style>
  .player {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
  }
  .play {
    width: 38px;
    font-size: 14px;
  }
  input[type='range'] {
    flex: 1;
    min-width: 80px;
    accent-color: var(--primary);
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .elapsed {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }
</style>
