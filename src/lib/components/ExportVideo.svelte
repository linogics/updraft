<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { CaptureSession } from '#lib/cesium/capture';
  import { ALL_PARTS, PART_LABELS, paintOverlay, type OverlayParts } from '#lib/export/overlay';
  import { mapCredits } from '#lib/export/credits';
  import { mp4Filename } from '#lib/export/filename';
  import { decodeMusic, renderMusic } from '#lib/export/music';
  import {
    ASPECTS,
    MAX_FPS,
    MAX_SIDE,
    MIN_FPS,
    MIN_SIDE,
    bitrateFor,
    clampFps,
    clampSide,
    presetSize,
    type Aspect
  } from '#lib/export/videoFormat';
  import { LENGTH_PRESETS, SPEED_PRESETS, planTiming, type TimingMode } from '#lib/export/videoTiming';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { formatClock, formatDuration } from '#lib/ui/format';

  let { replay }: { replay: ReplayState } = $props();

  type Encoder = typeof import('#lib/export/renderVideo');
  const RESOLUTIONS = [
    { value: '720', label: '720p' },
    { value: '1080', label: '1080p' },
    { value: '2160', label: '4K' },
    { value: 'custom', label: 'Custom' }
  ];

  let encoder = $state.raw<Encoder | null>(null);
  let codecs = $state<{ video: boolean; audio: boolean } | null>(null);

  let aspectId = $state<Aspect['id']>('16:9');
  let resolution = $state('1080');
  let customW = $state<number | null>(1920);
  let customH = $state<number | null>(1080);
  let fpsInput = $state<number | null>(30);
  let mode = $state<'length' | 'speed'>('length');
  let seconds = $state<number | null>(30);
  let factor = $state<number | null>(60);
  let parts = $state<OverlayParts>({ ...ALL_PARTS });
  let music = $state.raw<AudioBuffer | null>(null);
  let musicName = $state('');
  let musicMode = $state<'trim' | 'fit'>('trim');
  let musicError = $state('');

  let busy = $state(false);
  let done = $state(0);
  let total = $state(0);
  let started = $state(0);
  let now = $state(0);
  let error = $state('');
  let abort: AbortController | null = null;
  let dialog: HTMLDialogElement;

  const aspect = $derived(ASPECTS.find((a) => a.id === aspectId)!);
  const size = $derived(
    resolution === 'custom'
      ? { width: clampSide(customW), height: clampSide(customH) }
      : presetSize(aspect, Number(resolution))
  );
  const fps = $derived(clampFps(fpsInput));
  const bitrate = $derived(bitrateFor(size.width, size.height, fps));
  const range = $derived({ inMs: replay.exportIn ?? replay.start, outMs: replay.exportOut ?? replay.end });
  const fitMusic = $derived(!!music && musicMode === 'fit');
  const timingMode = $derived<TimingMode>(
    fitMusic
      ? { kind: 'length', seconds: music!.duration }
      : mode === 'length'
        ? { kind: 'length', seconds: Number(seconds) }
        : { kind: 'speed', factor: Number(factor) }
  );
  const plan = $derived.by(() => {
    try {
      return { timing: planTiming(range, timingMode, fps), error: '' };
    } catch (err) {
      return { timing: null, error: err instanceof Error ? err.message : String(err) };
    }
  });
  const credits = $derived(mapCredits(replay.basemap, replay.terrain));
  const otherValue = $derived.by(() => {
    const t = plan.timing;
    if (!t) return '';
    const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
    return mode === 'length' ? `= ${round(t.speed)}x` : `= ${round(t.seconds)} s`;
  });
  const rangeLength = $derived(formatDuration(Math.max(0, range.outMs - range.inMs) / 1000));
  const percent = $derived(total ? (done / total) * 100 : 0);
  const eta = $derived(done > 0 ? ((now - started) / 1000) * ((total - done) / done) : 0);

  onMount(() => {
    // Loaded on demand, so the encoder is not in the first page load.
    import('#lib/export/renderVideo')
      .then(async (m) => {
        encoder = m;
        codecs = { video: await m.videoEncodable(1920, 1080, bitrateFor(1920, 1080, 30), 30), audio: await m.audioEncodable() };
      })
      .catch(() => (codecs = { video: false, audio: false }));
  });

  // The dialog lives in body: the popover it sits in is display:none while closed.
  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function open(e: MouseEvent) {
    (e.currentTarget as HTMLElement).closest<HTMLElement>('[popover]')?.hidePopover();
    dialog.showModal();
  }

  function setIn() {
    replay.exportIn = replay.time;
  }

  function setOut() {
    replay.exportOut = replay.time;
  }

  function resetRange() {
    replay.exportIn = null;
    replay.exportOut = null;
  }

  async function pickMusic(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    music = null;
    musicName = '';
    musicError = '';
    if (!file) return;
    try {
      music = await decodeMusic(file);
      musicName = file.name;
    } catch {
      musicError = 'The browser could not read this audio file.';
    }
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function seek(t: number) {
    replay.seek(t);
    // Track tails and labels update in Svelte effects, so wait for them before the frame.
    await tick();
  }

  async function render() {
    const sel = replay.selected;
    const begin = replay.beginCapture;
    const timing = plan.timing;
    if (!sel || !begin || !timing || !encoder) return;
    const { width, height } = size;
    const name = mp4Filename(sel.source.pilot, sel.source.date, width, height);
    const enc = encoder;
    const savedTime = replay.time;
    const overlay = { ...parts };
    const units = unitPrefs.units;
    const controller = new AbortController();
    const clock = setInterval(() => (now = Date.now()), 500);
    let session: CaptureSession | undefined;

    error = '';
    busy = true;
    abort = controller;
    done = 0;
    total = timing.frames;
    started = now = Date.now();
    replay.pause();
    try {
      if (!(await enc.videoEncodable(width, height, bitrate, fps))) {
        throw new Error(`This browser cannot encode ${width} × ${height} video. Try a smaller size.`);
      }
      const audio = music ? await renderMusic(music, timing.seconds) : undefined;
      session = await begin(width, height);
      const blob = await enc.renderVideo({
        width,
        height,
        fps,
        bitrate,
        range,
        timing,
        music: audio,
        session,
        seek,
        paint: (ctx, t) =>
          paintOverlay(
            ctx,
            width,
            height,
            { selected: sel, flights: replay.flights.filter((f) => f.visible), replayTime: t, units, credits },
            overlay
          ),
        onProgress: (n) => (done = n),
        signal: controller.signal
      });
      download(blob, name);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      clearInterval(clock);
      session?.end();
      replay.seek(savedTime);
      abort = null;
      busy = false;
    }
  }
</script>

<button type="button" class="open" onclick={open} disabled={!codecs?.video || !replay.beginCapture}>Export video…</button>
{#if codecs && !codecs.video}
  <p class="hint">Video export needs Chrome, Edge or Safari 17+.</p>
{:else if !replay.beginCapture}
  <p class="hint">Switch to 3D or Split to export</p>
{/if}

<dialog
  bind:this={dialog}
  use:portal
  aria-labelledby="video-title"
  oncancel={(e) => {
    if (busy) e.preventDefault();
  }}
>
  <h2 id="video-title">Export video</h2>

  <fieldset>
    <legend>Size</legend>
    <div class="presets" role="group" aria-label="Aspect">
      {#each ASPECTS as a (a.id)}
        <button type="button" aria-pressed={aspectId === a.id} onclick={() => (aspectId = a.id)}>{a.label}</button>
      {/each}
    </div>
    <div class="grid">
      <label for="video-res">Resolution</label>
      <select id="video-res" bind:value={resolution}>
        {#each RESOLUTIONS as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
      </select>
      {#if resolution === 'custom'}
        <label for="video-width">Width</label>
        <input id="video-width" type="number" min={MIN_SIDE} max={MAX_SIDE} step="2" bind:value={customW} />
        <label for="video-height">Height</label>
        <input id="video-height" type="number" min={MIN_SIDE} max={MAX_SIDE} step="2" bind:value={customH} />
      {/if}
      <label for="video-fps">Frame rate</label>
      <input id="video-fps" type="number" min={MIN_FPS} max={MAX_FPS} step="1" bind:value={fpsInput} />
    </div>
    <p class="hint">{size.width} × {size.height} px at {fps} fps. Sides between {MIN_SIDE} and {MAX_SIDE}, fps between {MIN_FPS} and {MAX_FPS}.</p>
  </fieldset>

  <fieldset>
    <legend>Range</legend>
    <p class="hint">
      In {formatClock(range.inMs)} · Out {formatClock(range.outMs)} · {rangeLength}
      {#if replay.exportIn == null && replay.exportOut == null}(whole replay){/if}
    </p>
    <div class="row">
      <button type="button" onclick={setIn} disabled={busy}>Set in</button>
      <button type="button" onclick={setOut} disabled={busy}>Set out</button>
      <button type="button" onclick={resetRange} disabled={busy}>Reset</button>
    </div>
  </fieldset>

  <fieldset>
    <legend>Length or speed</legend>
    <div class="row">
      <label><input type="radio" name="video-timing" value="length" bind:group={mode} disabled={fitMusic} /> Length</label>
      <label><input type="radio" name="video-timing" value="speed" bind:group={mode} disabled={fitMusic} /> Speed</label>
    </div>
    {#if mode === 'length'}
      <div class="row">
        {#each LENGTH_PRESETS as s (s)}
          <button type="button" aria-pressed={seconds === s && !fitMusic} disabled={fitMusic} onclick={() => (seconds = s)}>{s} s</button>
        {/each}
      </div>
      <div class="grid">
        <label for="video-seconds">Seconds</label>
        <input id="video-seconds" type="number" min="1" step="1" bind:value={seconds} disabled={fitMusic} />
      </div>
    {:else}
      <div class="row">
        {#each SPEED_PRESETS as s (s)}
          <button type="button" aria-pressed={factor === s} onclick={() => (factor = s)}>{s}x</button>
        {/each}
      </div>
      <div class="grid">
        <label for="video-factor">Speed</label>
        <input id="video-factor" type="number" min="0.1" step="any" bind:value={factor} />
      </div>
    {/if}
    {#if plan.timing}
      <p class="hint" aria-live="polite">{otherValue}</p>
    {:else}
      <p class="warn" role="note">{plan.error}</p>
    {/if}
  </fieldset>

  <fieldset>
    <legend>Music</legend>
    <label for="video-music">Audio file</label>
    <input id="video-music" type="file" accept="audio/*" onchange={pickMusic} disabled={busy || codecs?.audio === false} />
    {#if codecs && !codecs.audio}<p class="hint">Music needs AAC audio encoding, which this browser lacks.</p>{/if}
    {#if musicName}
      <p class="hint">{musicName}, {formatDuration(music!.duration)}</p>
      <div class="row" role="group" aria-label="Music length">
        <button type="button" aria-pressed={musicMode === 'trim'} onclick={() => (musicMode = 'trim')}>Trim to video</button>
        <button type="button" aria-pressed={musicMode === 'fit'} onclick={() => ((musicMode = 'fit'), (mode = 'length'))}>Fit video to music</button>
      </div>
    {/if}
    {#if musicError}<p class="error" role="alert">{musicError}</p>{/if}
  </fieldset>

  <fieldset>
    <legend>Overlays</legend>
    {#each PART_LABELS as [key, label] (key)}
      <div class="check">
        <input id="video-part-{key}" type="checkbox" bind:checked={parts[key]} disabled={busy} />
        <label for="video-part-{key}">{label}</label>
      </div>
    {/each}
    {#if !parts.credits}
      <p class="warn" role="note">Map providers require attribution when you publish this video.</p>
    {/if}
  </fieldset>

  {#if busy}
    <progress max={total} value={done}>{percent.toFixed(0)}%</progress>
    <p class="hint" aria-live="polite">
      Frame {done} of {total} · {formatDuration((now - started) / 1000)} elapsed · about {formatDuration(eta)} left
    </p>
  {/if}
  {#if !replay.beginCapture}<p class="hint">Switch to 3D or Split to export</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="row end">
    {#if busy}
      <button type="button" onclick={() => abort?.abort()}>Cancel</button>
    {:else}
      <button type="button" onclick={() => dialog.close()}>Close</button>
    {/if}
    <button
      type="button"
      class="primary"
      onclick={render}
      disabled={busy || !replay.beginCapture || !plan.timing || !encoder}
    >
      {busy ? 'Rendering…' : 'Render MP4'}
    </button>
  </div>
</dialog>

<style>
  .open {
    display: block;
    width: 100%;
    margin-top: 10px;
    font-size: 13px;
  }
  dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    margin: auto;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 13px;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }
  h2 {
    margin: 0 0 10px;
    font-size: 16px;
  }
  fieldset {
    display: grid;
    gap: 8px;
    margin: 0 0 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  legend {
    padding: 0 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .presets,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .row.end {
    justify-content: flex-end;
    margin-top: 6px;
  }
  .presets button {
    flex: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 10px;
  }
  .grid input,
  .grid select {
    min-width: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  label {
    color: var(--muted);
  }
  .row label {
    color: var(--text);
  }
  progress {
    width: 100%;
  }
  .hint,
  .warn {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .warn {
    color: #e5a500;
  }
  .error {
    margin: 0;
    color: #e5484d;
    font-size: 12px;
  }
  .primary {
    background: #3987e5;
    border-color: #3987e5;
    color: #fff;
  }
</style>
