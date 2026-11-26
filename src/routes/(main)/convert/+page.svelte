<script lang="ts">
  import Dropzone from '#lib/components/Dropzone.svelte';
  import AddPluginDialog from '#lib/components/studio/AddPluginDialog.svelte';
  import { converters, formatOf, readTrack, writers, writeTrack } from '#lib/convert/registry';
  import type { Flight } from '#lib/domain/model';
  import { zipStore } from '#lib/export/zip';
  import { m } from '#lib/paraglide/messages';
  import { removePlugin } from '#lib/plugins/actions';
  import { BUILTIN_CONVERTERS } from '#lib/plugins/builtin';
  import { flightRepository } from '#lib/storage';

  type Row = { name: string; format?: string; flight?: Flight; error?: string };

  let addDialog: AddPluginDialog;
  const builtIn = new Set(BUILTIN_CONVERTERS.map((b) => b.id));
  let rows = $state<Row[]>([]);
  let targetId = $state('updraft/gpx');
  let save = $state(true);
  let busy = $state(false);
  let writeError = $state('');

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

  const target = $derived(writers().find((w) => w.id === targetId) ?? writers()[0]);
  const fileName = (flight: Flight) => `${flight.sourceName.replace(/\.[^.]*$/, '')}.${target.extensions[0]}`;

  // A plugin writer can throw, the message ends up on the page.
  async function safely(run: () => Promise<void>) {
    writeError = '';
    try {
      await run();
    } catch (err) {
      writeError = err instanceof Error ? err.message : String(err);
    }
  }

  const download = (flight: Flight) =>
    safely(async () => {
      const data = await writeTrack(target, flight);
      saveFile(new Blob([data as BlobPart], { type: target.mime ?? 'application/octet-stream' }), fileName(flight));
    });

  const downloadAll = () => safely(zipAll);

  async function zipAll() {
    // Local duplicate counter for file names, not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const seen = new Map<string, number>();
    const files = await Promise.all(
      ok.map(async (r) => {
        let name = fileName(r.flight!);
        const n = (seen.get(name) ?? 0) + 1;
        seen.set(name, n);
        if (n > 1) name = name.replace(/(\.[^.]*)$/, `-${n}$1`);
        return { name, data: await writeTrack(target, r.flight!) };
      })
    );
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

<div class="convert">
  <header>
    <h1>{m.home_convert_title()}</h1>
    <p>{m.convert_intro()}</p>
  </header>

  <Dropzone onfiles={load} {busy} hint={m.convert_drop_hint()} />

  <div class="options">
    <label>
      {m.convert_output_format()}
      <select bind:value={targetId}>
        {#each writers() as w (w.id)}<option value={w.id}>{w.label}</option>{/each}
      </select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={save} /> {m.convert_save_logbook()}</label>
    <button disabled={!ok.length} onclick={downloadAll}>{m.convert_download_all()}</button>
  </div>
  {#if target.id === 'updraft/igc'}
    <p class="note">{m.convert_igc_note()}</p>
  {/if}

  {#if writeError}
    <p class="error">{writeError}</p>
  {/if}

  {#if rows.length}
    <table>
      <thead>
        <tr>
          <th>{m.convert_col_file()}</th><th>{m.convert_col_format()}</th><th>{m.convert_col_fixes()}</th><th>
            {m.export_row_date()}
          </th><th></th>
        </tr>
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

  <section class="formats" aria-labelledby="formats-title">
    <h2 id="formats-title">{m.convert_formats()}</h2>
    <ul>
      {#each converters() as c (c.id)}
        <li>
          <strong>{c.label}</strong>
          <span class="muted">{c.extensions.map((e) => `.${e}`).join(' ')}</span>
          <span class="muted">
            {[c.canRead && m.convert_reads(), c.canWrite && m.convert_writes()].filter(Boolean).join(', ')}
          </span>
          {#if builtIn.has(c.id)}
            <span class="badge">{m.convert_builtin()}</span>
          {:else}
            <button
              type="button"
              aria-label={m.plugin_uninstall_label({ name: c.label })}
              onclick={() => removePlugin(c.id)}
            >
              {m.plugin_uninstall()}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    <button type="button" onclick={() => addDialog.open()}>{m.convert_add_format()}</button>
  </section>
</div>

<AddPluginDialog bind:this={addDialog} kinds={['converter']} />

<style>
  .convert {
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
  .formats {
    display: grid;
    justify-items: start;
    gap: 8px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .badge {
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  .muted {
    color: var(--muted);
  }
  .error {
    color: var(--danger);
  }
</style>
