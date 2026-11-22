<script lang="ts">
  let { onfiles, busy = false, compact = false }: { onfiles: (files: File[]) => void; busy?: boolean; compact?: boolean } = $props();

  let over = $state(false);

  function accept(list: FileList | null | undefined) {
    const files = [...(list ?? [])].filter((f) => /\.igc$/i.test(f.name));
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
  <input type="file" accept=".igc" multiple disabled={busy} onchange={(e) => accept(e.currentTarget.files)} />
  <strong>{busy ? 'Processing…' : 'Drop IGC files here'}</strong>
  <span>or click to choose. Several files from the same day are replayed together.</span>
</label>

<style>
  .drop {
    display: grid;
    place-items: center;
    gap: 6px;
    padding: 40px 20px;
    border: 2px dashed #3a3f48;
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .drop.over,
  .drop:hover {
    border-color: #3987e5;
    background: rgba(57, 135, 229, 0.06);
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
