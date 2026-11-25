<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { buildBackup, restoreBackup } from '#lib/storage/backup';

  let { ondone }: { ondone: () => void } = $props();

  let includeToken = $state(false);
  // Raw: a deep state proxy cannot be stored in IndexedDB.
  let pending = $state.raw<unknown>(null);
  let message = $state('');
  let failed = $state(false);
  let restored = $state(false);

  function say(text: string, error = false) {
    message = text;
    failed = error;
    restored = false;
  }

  async function exportBackup() {
    try {
      const backup = await buildBackup(includeToken);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `updraft-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(m.backup_exported({ count: backup.flights.length + backup.manual.length }));
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      pending = JSON.parse(await file.text());
      say(m.backup_loaded({ name: file.name }));
    } catch {
      pending = null;
      say(m.backup_invalid_json(), true);
    }
  }

  async function restore(mode: 'merge' | 'replace') {
    if (mode === 'replace' && !confirm(m.backup_confirm_replace())) return;

    try {
      const n = await restoreBackup(pending, mode);
      pending = null;
      say(m.backup_restored({ flights: n.flights, manual: n.manual, cameraPaths: n.cameraPaths }));
      restored = true;
      ondone();
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    }
  }
</script>

<section class="card">
  <h2>{m.backup_heading()}</h2>
  <p class="muted">{m.backup_intro()}</p>
  <label class="check"><input type="checkbox" bind:checked={includeToken} /> {m.backup_include_keys()}</label>
  {#if includeToken}<p class="muted">{m.backup_keys_warning()}</p>{/if}
  <div class="row">
    <button onclick={exportBackup}>{m.backup_export()}</button>
    <label class="file">
      <input type="file" accept=".json,application/json" onchange={pick} />
      <span>{m.backup_import()}</span>
    </label>
  </div>
  {#if pending}
    <div class="row">
      <button onclick={() => restore('merge')}>{m.backup_merge()}</button>
      <button onclick={() => restore('replace')}>{m.backup_replace()}</button>
    </div>
  {/if}
  {#if message}<p class:error={failed} role="status">{message}</p>{/if}
  {#if restored}<button onclick={() => location.reload()}>{m.backup_reload()}</button>{/if}
</section>

<style>
  h2 {
    margin: 0 0 4px;
    font: 600 20px/1 var(--display);
  }
  .muted {
    color: var(--muted);
    margin: 4px 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 8px 0;
  }
  .error {
    color: var(--danger);
  }
  .file {
    position: relative;
  }
  /* Visually hidden but focusable, the span shows the focus ring. */
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .file span {
    display: inline-block;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
  }
  .file:focus-within span {
    outline: 2px solid var(--primary-hi);
    outline-offset: 2px;
  }
</style>
