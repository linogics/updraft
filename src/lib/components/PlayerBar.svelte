<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { SPEEDS, type ReplayState } from '#lib/state/replay.svelte';
  import { formatClock, formatDuration } from '#lib/ui/format';

  let { replay }: { replay: ReplayState } = $props();
</script>

<div class="player">
  <button class="play" onclick={() => replay.toggle()} aria-label={replay.playing ? m.player_pause() : m.player_play()}>
    {replay.playing ? '❚❚' : '▶'}
  </button>
  <select bind:value={replay.speed} aria-label={m.player_speed()}>
    {#each SPEEDS as s (s)}<option value={s}>{s}×</option>{/each}
  </select>
  <button onclick={() => replay.nextThermal()} title={m.player_next_thermal_title()}>{m.player_next_thermal()}</button>
  <span class="clock">{formatClock(replay.time)}</span>
  <input
    type="range"
    min={replay.start}
    max={replay.end}
    step={1000}
    value={replay.time}
    oninput={(e) => replay.seek(Number(e.currentTarget.value))}
    aria-label={m.player_position()}
  />
  <span class="elapsed">
    {formatDuration((replay.time - replay.start) / 1000)} / {formatDuration((replay.end - replay.start) / 1000)}
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
