<script lang="ts">
  import { ALL_PARTS, PART_LABELS, paintOverlay, type OverlayParts } from '#lib/export/overlay';
  import { pngFilename } from '#lib/export/filename';
  import { mapCredits } from '#lib/export/credits';
  import { thermalOverlayPrefs } from '#lib/thermals/prefs.svelte';
  import type { ReplayState } from '#lib/state/replay.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';

  let { replay }: { replay: ReplayState } = $props();

  const PRESETS = [
    { label: '16:9', width: 1920, height: 1080 },
    { label: '9:16', width: 1080, height: 1920 },
    { label: '1:1', width: 1080, height: 1080 }
  ];
  const MIN = 320;
  const MAX = 4096;
  const clamp = (v: number | null) => Math.min(MAX, Math.max(MIN, Math.round(Number(v)) || MIN));

  let width = $state<number | null>(1920);
  let height = $state<number | null>(1080);
  let parts = $state<OverlayParts>({ ...ALL_PARTS });
  let busy = $state(false);
  let error = $state('');

  const w = $derived(clamp(width));
  const h = $derived(clamp(height));
  const credits = $derived(mapCredits(replay.basemap, replay.terrain, thermalOverlayPrefs.hotspots || thermalOverlayPrefs.skyways));
  const canExport = $derived(!!replay.capture && !!replay.selected && !busy);

  function pick(p: { width: number; height: number }) {
    width = p.width;
    height = p.height;
  }

  async function download() {
    const sel = replay.selected;
    const capture = replay.capture;
    if (!sel || !capture) return;
    busy = true;
    error = '';
    try {
      // The captured frame is already w x h, so the overlay is painted straight onto it.
      const out = await capture(w, h);
      const ctx = out.getContext('2d')!;
      paintOverlay(
        ctx,
        w,
        h,
        {
          selected: sel,
          flights: replay.flights.filter((f) => f.visible),
          replayTime: replay.time,
          units: unitPrefs.units,
          credits
        },
        parts
      );
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The browser could not encode the PNG.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pngFilename(sel.source.pilot, sel.source.date, w, h);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="export">
  <fieldset>
    <legend>Size</legend>
    <div class="presets" role="group" aria-label="Aspect preset">
      {#each PRESETS as p (p.label)}
        <button type="button" aria-pressed={w === p.width && h === p.height} onclick={() => pick(p)}>{p.label}</button>
      {/each}
    </div>
    <div class="size">
      <label for="export-width">Width</label>
      <input id="export-width" type="number" min={MIN} max={MAX} step="1" bind:value={width} />
      <label for="export-height">Height</label>
      <input id="export-height" type="number" min={MIN} max={MAX} step="1" bind:value={height} />
    </div>
    <p class="hint">{w} × {h} px, between {MIN} and {MAX}.</p>
  </fieldset>

  <fieldset>
    <legend>Overlays</legend>
    {#each PART_LABELS as [key, label] (key)}
      <div class="check">
        <input id="export-part-{key}" type="checkbox" bind:checked={parts[key]} />
        <label for="export-part-{key}">{label}</label>
      </div>
    {/each}
    {#if !parts.credits}
      <p class="warn" role="note">Map providers require attribution when you publish this image.</p>
    {/if}
  </fieldset>

  <button type="button" class="download" onclick={download} disabled={!canExport}>
    {busy ? 'Rendering…' : 'Download PNG'}
  </button>
  {#if !replay.capture}
    <p class="hint">Switch to 3D or Split to export</p>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .export {
    display: grid;
    gap: 10px;
    width: 260px;
  }
  fieldset {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  legend {
    padding: 0 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .presets {
    display: flex;
  }
  .presets button {
    flex: 1;
    border-radius: 0;
  }
  .presets button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .presets button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .presets button[aria-pressed='true'] {
    background: #3987e5;
    border-color: #3987e5;
    color: #fff;
  }
  .size {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px 10px;
  }
  .size input {
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
  .download {
    justify-self: stretch;
  }
</style>
