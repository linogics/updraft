<script lang="ts">
  import { m } from '#lib/paraglide/messages';

  let {
    onfiles,
    busy = false,
    compact = false,
    hint = m.drop_hint()
  }: { onfiles: (files: File[]) => void; busy?: boolean; compact?: boolean; hint?: string } = $props();

  let over = $state(false);

  function accept(list: FileList | null | undefined) {
    const files = [...(list ?? [])].filter((f) => /\.(igc|gpx|kml|geojson|json|trk|fit)$/i.test(f.name));
    if (files.length) onfiles(files);
  }
</script>

<label
  class="drop"
  class:over
  class:compact
  ondragover={(e) => {
    e.preventDefault();
    over = true;
  }}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    e.preventDefault();
    over = false;
    accept(e.dataTransfer?.files);
  }}
>
  <input
    type="file"
    accept=".igc,.gpx,.kml,.geojson,.json,.trk,.fit"
    multiple
    disabled={busy}
    onchange={(e) => accept(e.currentTarget.files)}
  />
  <strong>{busy ? m.drop_processing() : m.drop_here()}</strong>
  <span>{hint}</span>
</label>

<style>
  .drop {
    display: grid;
    place-items: center;
    gap: 6px;
    padding: 40px 20px;
    border: 2px dashed var(--border-hi);
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .drop.over,
  .drop:hover {
    border-color: var(--primary-hi);
    background: var(--primary-dim);
  }
  .drop.compact {
    padding: 18px 16px;
    border-width: 1px;
  }
  .compact strong {
    font-size: 15px;
  }
  input {
    display: none;
  }
  strong {
    font-size: 18px;
  }
  span {
    color: var(--muted);
    font-size: 13px;
  }
</style>
