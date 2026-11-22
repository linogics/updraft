<script lang="ts">
  import Dropzone from '#lib/components/Dropzone.svelte';
  import { m } from '#lib/paraglide/messages';
  import Logo from '#lib/components/Logo.svelte';
  import { WRITERS, formatOf, readTrack, type WriterKey } from '#lib/domain/formats';
  import type { Flight } from '#lib/domain/model';
  import { zipStore } from '#lib/export/zip';
  import { flightRepository } from '#lib/storage';

  type Row = { name: string; format?: string; flight?: Flight; error?: string };

  let rows = $state<Row[]>([]);
  let target = $state<WriterKey>('gpx');
  let save = $state(true);
  let busy = $state(false);

  async function load(files: File[]) {
    busy = true;
    const next: Row[] = [];
    for (const file of files) {
      const format = formatOf(file.name);
      try {
        const flight = await readTrack(file);
        if (save) await flightRepository.save(flight);
        next.push({ name: file.name, format, flight });
      } catch (err) {
        next.push({ name: file.name, format, error: err instanceof Error ? err.message : String(err) });
      }
    }
    rows = [...rows, ...next];
    busy = false;
  }

  const fileName = (flight: Flight) => `${flight.sourceName.replace(/\.[^.]*$/, '')}.${WRITERS[target].ext}`;

  function download(flight: Flight) {
    const w = WRITERS[target];
    saveFile(new Blob([w.write(flight)], { type: w.mime }), fileName(flight));
  }

  function downloadAll() {
    const seen = new Map<string, number>();
    const enc = new TextEncoder();
    const files = ok.map((r) => {
      let name = fileName(r.flight!);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      if (n > 1) name = name.replace(/(\.[^.]*)$/, `-${n}$1`);
      return { name, data: enc.encode(WRITERS[target].write(r.flight!)) };
    });
    saveFile(new Blob([zipStore(files) as BlobPart], { type: 'application/zip' }), 'updraft-tracks.zip');
  }

  function saveFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking at once can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const ok = $derived(rows.filter((r) => r.flight));
</script>

<svelte:head>
  <title>{m.convert_title()}</title>
</svelte:head>

<main>
  <header>
    <Logo />
    <h1>{m.home_convert_title()}</h1>
    <p>{m.convert_intro()}</p>
  </header>

  <Dropzone onfiles={load} {busy} hint={m.convert_drop_hint()} />

  <div class="options">
    <label>
      {m.convert_output_format()}
      <select bind:value={target}>
        {#each Object.entries(WRITERS) as [key, w] (key)}<option value={key}>{w.label}</option>{/each}
      </select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={save} /> {m.convert_save_logbook()}</label>
    <button disabled={!ok.length} onclick={downloadAll}>{m.convert_download_all()}</button>
  </div>
  {#if target === 'igc'}
    <p class="note">{m.convert_igc_note()}</p>
  {/if}

  {#if rows.length}
    <table>
      <thead>
        <tr><th>{m.convert_col_file()}</th><th>{m.convert_col_format()}</th><th>{m.convert_col_fixes()}</th><th>{m.export_row_date()}</th><th></th></tr>
      </thead>
      <tbody>
        {#each rows as r, i (i)}
          <tr>
            <td>{r.name}</td>
            <td class="muted">{r.format ?? '–'}</td>
            {#if r.flight}
              <td>{r.flight.fixes.length}</td>
              <td>{r.flight.date}</td>
              <td><button onclick={() => download(r.flight!)}>{m.convert_download()}</button></td>
            {:else}
              <td colspan="3" class="error">{r.error}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</main>

<style>
  main {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 16px;
    display: grid;
    gap: 20px;
  }
  h1 {
    margin: 12px 0 0;
    font: 600 32px/1.1 var(--display);
  }
  header p {
    margin: 4px 0 0;
    color: var(--muted);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }
  .options .check {
    flex: 1;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    font-size: 12px;
  }
  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }
  .muted {
    color: var(--muted);
  }
  .error {
    color: var(--danger);
  }
</style>
