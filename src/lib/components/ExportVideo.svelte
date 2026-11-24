<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { CaptureSession } from '#lib/cesium/capture';
  import { ALL_PARTS, PART_LABELS, paintOverlay, type OverlayParts } from '#lib/export/overlay';
  import { mapCredits } from '#lib/export/credits';
  import { thermalOverlayPrefs } from '#lib/thermals/prefs.svelte';
  import { mp4Filename } from '#lib/export/filename';
  import { decodeMusic, renderMusic } from '#lib/export/music';
  import {
    ASPECTS,
    MAX_FPS,
    MAX_SIDE,
    MIN_FPS,
    MIN_SIDE,
    QUALITIES,
    bitrateFor,
    clampFps,
    clampSide,
    presetSize,
    type Aspect,
    type QualityId
  } from '#lib/export/videoFormat';
  import { LENGTH_PRESETS, SPEED_PRESETS, planTiming, type TimingMode } from '#lib/export/videoTiming';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { m } from '#lib/paraglide/messages';
  import { formatClock, formatDuration } from '#lib/ui/format';

  let { studio }: { studio: StudioState } = $props();

  type Encoder = typeof import('#lib/export/renderVideo');
  const RESOLUTIONS = [
    { value: '720', label: '720p' },
    { value: '1080', label: '1080p' },
    { value: '2160', label: '4K' },
    { value: 'custom', label: m.common_custom() }
  ];
  const QUALITY_LABELS = {
    standard: () => m.export_quality_standard(),
    high: () => m.export_quality_high(),
    max: () => m.export_quality_max()
  } as const;

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
  let quality = $state<QualityId>('high');
  const bitrate = $derived(bitrateFor(size.width, size.height, fps, quality));
  const range = $derived({ inMs: studio.exportIn ?? studio.start, outMs: studio.exportOut ?? studio.end });
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
  const credits = $derived(
    mapCredits(studio.basemap, studio.terrain, thermalOverlayPrefs.hotspots || thermalOverlayPrefs.skyways)
  );
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
        codecs = {
          video: await m.videoEncodable(1920, 1080, bitrateFor(1920, 1080, 30), 30),
          audio: await m.audioEncodable()
        };
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
    studio.exportIn = studio.time;
  }

  function setOut() {
    studio.exportOut = studio.time;
  }

  function resetRange() {
    studio.exportIn = null;
    studio.exportOut = null;
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
      musicError = m.export_music_error();
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
    studio.seek(t);
    // Track tails and labels update in Svelte effects, so wait for them before the frame.
    await tick();
  }

  async function render() {
    const sel = studio.selected;
    const begin = studio.beginCapture;
    const timing = plan.timing;
    if (!sel || !begin || !timing || !encoder) return;
    const { width, height } = size;
    const name = mp4Filename(sel.source.pilot, sel.source.date, width, height);
    const enc = encoder;
    const savedTime = studio.time;
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
    studio.pause();
    try {
      if (!(await enc.videoEncodable(width, height, bitrate, fps))) {
        throw new Error(m.export_video_cannot_encode({ width, height }));
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
            { selected: sel, flights: studio.flights.filter((f) => f.visible), studioTime: t, units, credits },
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
      studio.seek(savedTime);
      abort = null;
      busy = false;
    }
  }
</script>

<button type="button" class="open" onclick={open} disabled={!codecs?.video || !studio.beginCapture}>
  {m.export_video_button()}
</button>
{#if codecs && !codecs.video}
  <p class="hint">{m.export_video_needs_codec()}</p>
{:else if !studio.beginCapture}
  <p class="hint">{m.export_menu_hint_switch()}</p>
{/if}

<dialog
  bind:this={dialog}
  use:portal
  aria-labelledby="video-title"
  oncancel={(e) => {
    if (busy) e.preventDefault();
  }}
>
  <h2 id="video-title">{m.export_video_title()}</h2>

  <fieldset>
    <legend>{m.export_size()}</legend>
    <div class="presets" role="group" aria-label={m.export_aspect()}>
      {#each ASPECTS as a (a.id)}
        <button type="button" aria-pressed={aspectId === a.id} onclick={() => (aspectId = a.id)}>{a.label}</button>
      {/each}
    </div>
    <div class="grid">
      <label for="video-res">{m.export_resolution()}</label>
      <select id="video-res" bind:value={resolution}>
        {#each RESOLUTIONS as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
      </select>
      {#if resolution === 'custom'}
        <label for="video-width">{m.common_width()}</label>
        <input id="video-width" type="number" min={MIN_SIDE} max={MAX_SIDE} step="2" bind:value={customW} />
        <label for="video-height">{m.common_height()}</label>
        <input id="video-height" type="number" min={MIN_SIDE} max={MAX_SIDE} step="2" bind:value={customH} />
      {/if}
      <label for="video-fps">{m.export_frame_rate()}</label>
      <input id="video-fps" type="number" min={MIN_FPS} max={MAX_FPS} step="1" bind:value={fpsInput} />
      <label for="video-quality">{m.export_quality()}</label>
      <select id="video-quality" bind:value={quality}>
        {#each QUALITIES as q (q.id)}<option value={q.id}>{QUALITY_LABELS[q.id]()}</option>{/each}
      </select>
    </div>
    <p class="hint">
      {m.export_video_size_hint({
        width: size.width,
        height: size.height,
        fps,
        minSide: MIN_SIDE,
        maxSide: MAX_SIDE,
        minFps: MIN_FPS,
        maxFps: MAX_FPS
      })}
    </p>
    <p class="hint">
      {#if plan.timing}
        {m.export_bitrate_size({
          mbit: Math.round(bitrate / 1_000_000),
          mb: Math.round((bitrate * plan.timing.seconds) / 8_000_000)
        })}
      {:else}
        {m.export_bitrate({ mbit: Math.round(bitrate / 1_000_000) })}
      {/if}
    </p>
  </fieldset>

  <fieldset>
    <legend>{m.export_range()}</legend>
    <p class="hint">
      {#if studio.exportIn == null && studio.exportOut == null}
        {m.export_range_info_whole({
          from: formatClock(range.inMs),
          to: formatClock(range.outMs),
          length: rangeLength
        })}
      {:else}
        {m.export_range_info({ from: formatClock(range.inMs), to: formatClock(range.outMs), length: rangeLength })}
      {/if}
    </p>
    <div class="row">
      <button type="button" onclick={setIn} disabled={busy}>{m.export_set_in()}</button>
      <button type="button" onclick={setOut} disabled={busy}>{m.export_set_out()}</button>
      <button type="button" onclick={resetRange} disabled={busy}>{m.export_reset()}</button>
    </div>
  </fieldset>

  <fieldset>
    <legend>{m.export_timing()}</legend>
    <div class="row">
      <label>
        <input type="radio" name="video-timing" value="length" bind:group={mode} disabled={fitMusic} />
        {m.export_timing_length()}
      </label>
      <label>
        <input type="radio" name="video-timing" value="speed" bind:group={mode} disabled={fitMusic} />
        {m.export_timing_speed()}
      </label>
    </div>
    {#if mode === 'length'}
      <div class="row">
        {#each LENGTH_PRESETS as s (s)}
          <button
            type="button"
            aria-pressed={seconds === s && !fitMusic}
            disabled={fitMusic}
            onclick={() => (seconds = s)}
          >
            {s} s
          </button>
        {/each}
      </div>
      <div class="grid">
        <label for="video-seconds">{m.export_seconds()}</label>
        <input id="video-seconds" type="number" min="1" step="1" bind:value={seconds} disabled={fitMusic} />
      </div>
    {:else}
      <div class="row">
        {#each SPEED_PRESETS as s (s)}
          <button type="button" aria-pressed={factor === s} onclick={() => (factor = s)}>{s}x</button>
        {/each}
      </div>
      <div class="grid">
        <label for="video-factor">{m.export_timing_speed()}</label>
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
    <legend>{m.export_music()}</legend>
    <label for="video-music">{m.export_audio_file()}</label>
    <input
      id="video-music"
      type="file"
      accept="audio/*"
      onchange={pickMusic}
      disabled={busy || codecs?.audio === false}
    />
    {#if codecs && !codecs.audio}<p class="hint">{m.export_music_needs_aac()}</p>{/if}
    {#if musicName}
      <p class="hint">{musicName}, {formatDuration(music!.duration)}</p>
      <div class="row" role="group" aria-label={m.export_music_length()}>
        <button type="button" aria-pressed={musicMode === 'trim'} onclick={() => (musicMode = 'trim')}>
          {m.export_music_trim()}
        </button>
        <button
          type="button"
          aria-pressed={musicMode === 'fit'}
          onclick={() => ((musicMode = 'fit'), (mode = 'length'))}
        >
          {m.export_music_fit()}
        </button>
      </div>
    {/if}
    {#if musicError}<p class="error" role="alert">{musicError}</p>{/if}
  </fieldset>

  <fieldset>
    <legend>{m.export_overlays()}</legend>
    {#each PART_LABELS as { key, label } (key)}
      <div class="check">
        <input id="video-part-{key}" type="checkbox" bind:checked={parts[key]} disabled={busy} />
        <label for="video-part-{key}">{label()}</label>
      </div>
    {/each}
    {#if !parts.credits}
      <p class="warn" role="note">{m.export_video_credits_warn()}</p>
    {/if}
  </fieldset>

  {#if busy}
    <progress max={total} value={done}>{percent.toFixed(0)}%</progress>
    <p class="hint" aria-live="polite">
      {m.export_progress({ done, total, elapsed: formatDuration((now - started) / 1000), left: formatDuration(eta) })}
    </p>
  {/if}
  {#if !studio.beginCapture}<p class="hint">{m.export_menu_hint_switch()}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="row end">
    {#if busy}
      <button type="button" onclick={() => abort?.abort()}>{m.common_cancel()}</button>
    {:else}
      <button type="button" onclick={() => dialog.close()}>{m.common_close()}</button>
    {/if}
    <button
      type="button"
      class="primary"
      onclick={render}
      disabled={busy || !studio.beginCapture || !plan.timing || !encoder}
    >
      {busy ? m.export_rendering() : m.export_render_mp4()}
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
    color: var(--warn);
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
  .primary {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--bg);
  }
</style>
