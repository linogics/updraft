<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { flightRepository, type FlightSummary } from '#lib/storage';
  import { importFlights } from '#lib/storage/importFlights';
  import { addStored } from '#lib/studio/addPilots';
  import { formatAirtime } from '#lib/ui/format';
  import { TRACK_ACCEPT, trackFiles } from '#lib/ui/trackFiles';

  let { studio }: { studio: StudioState } = $props();

  let dialog: HTMLDialogElement;
  let fileInput: HTMLInputElement;
  let flights = $state<FlightSummary[]>([]);
  let selected = $state<string[]>([]);
  let filter = $state('');
  let errors = $state<string[]>([]);
  let busy = $state(false);

  const loaded = $derived(new Set(studio.flights.map((f) => f.source.id)));
  const shown = $derived.by(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return flights.filter((f) => {
      const text = `${f.pilot} ${f.site ?? ''} ${f.date}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  });

  async function refresh() {
    try {
      const all = await flightRepository.list();
      flights = all.filter((f) => !f.manual).sort((a, b) => b.startTime - a.startTime);
    } catch (err) {
      console.error('Could not list flights', err);
      errors = [m.pilots_add_list_failed()];
    }
  }

  /** Opens the picker as a modal with a fresh list. The browser returns focus to the opener on close. */
  export async function open() {
    filter = '';
    selected = [];
    errors = [];
    dialog.showModal();
    await refresh();
  }

  async function importFiles(list: FileList | null) {
    const files = trackFiles(list);
    fileInput.value = '';
    if (!files.length) return;
    busy = true;
    try {
      const result = await importFlights(files);
      errors = result.errors;
      await refresh();
      selected = [...new Set([...selected, ...result.ids.filter((id) => !loaded.has(id))])];
    } finally {
      busy = false;
    }
  }

  function onclose() {
    const add = dialog.returnValue === 'add';
    // Esc and click outside set no value, so reset it or a stale one leaks into the next close.
    dialog.returnValue = '';
    if (add) {
      addStored(studio, selected).catch((err) => console.error('Could not add pilots', err));
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="add-pilots-title" closedby="any" {onclose}>
  <h1 id="add-pilots-title">{m.pilots_add_title()}</h1>

  <search>
    <label for="add-pilots-filter">{m.pilots_add_filter()}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="add-pilots-filter"
      type="search"
      name="filter"
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      autofocus
      bind:value={filter}
    />
  </search>

  <form method="dialog">
    <ul aria-label={m.logbook_col_flights()}>
      {#each shown as f (f.id)}
        {@const inStudio = loaded.has(f.id)}
        <li>
          <label>
            {#if inStudio}
              <input type="checkbox" checked disabled />
            {:else}
              <input type="checkbox" name="flight" value={f.id} bind:group={selected} />
            {/if}
            <span class="who">{f.pilot}</span>
            <span class="meta">
              {f.date} · {f.site ?? '–'} · {formatAirtime(f.endTime - f.startTime)}
              {#if inStudio}· {m.pilots_add_in_studio()}{/if}
            </span>
          </label>
        </li>
      {:else}
        <li class="empty">{m.pilots_add_empty()}</li>
      {/each}
    </ul>

    {#if errors.length}
      <ul class="errors" role="alert">
        {#each errors as e (e)}<li>{e}</li>{/each}
      </ul>
    {/if}

    <div class="row">
      <input
        type="file"
        accept={TRACK_ACCEPT}
        multiple
        hidden
        bind:this={fileInput}
        onchange={(e) => importFiles(e.currentTarget.files)}
      />
      <button type="button" disabled={busy} onclick={() => fileInput.click()}>
        {busy ? m.drop_processing() : m.pilots_add_import()}
      </button>
      <span class="grow"></span>
      <button value="cancel">{m.common_cancel()}</button>
      <button value="add" class="primary" disabled={!selected.length}>
        {m.pilots_add_submit({ count: selected.length })}
      </button>
    </div>
  </form>
</dialog>

<style>
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
  dialog:modal {
    overscroll-behavior: contain;
  }
  dialog::backdrop {
    overflow: hidden;
    overscroll-behavior: contain;
    background: rgba(0, 0, 0, 0.5);
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h1 {
    margin: 0;
    font-size: 16px;
  }
  search {
    display: grid;
    gap: 4px;
  }
  label[for] {
    color: var(--muted);
    font-size: 12px;
  }
  input[type='search'] {
    font: inherit;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    max-height: 320px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  li label {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    padding: 6px 8px;
    cursor: pointer;
  }
  li label:hover {
    background: var(--surface-2);
  }
  li input {
    grid-row: span 2;
    align-self: center;
  }
  .who {
    font-weight: 600;
  }
  .meta {
    color: var(--muted);
    font-size: 12px;
  }
  .empty {
    padding: 12px;
    color: var(--muted);
  }
  .errors {
    max-height: none;
    border-color: var(--danger);
    padding: 6px 8px;
    color: var(--danger);
    font-size: 12px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .primary {
    border-color: var(--primary);
    background: var(--primary-dim);
  }
</style>
