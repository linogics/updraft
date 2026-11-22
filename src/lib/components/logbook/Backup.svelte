<script lang="ts">
  import { buildBackup, restoreBackup } from '#lib/storage/backup';

  let { ondone }: { ondone: () => void } = $props();

  let includeToken = $state(false);
  // Raw: a deep state proxy cannot be stored in IndexedDB.
  let pending = $state.raw<unknown>(null);
  let message = $state('');
  let failed = $state(false);

  function say(text: string, error = false) {
    message = text;
    failed = error;
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
      say(`Exported ${backup.flights.length + backup.manual.length} flights.`);
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
      say(`Loaded ${file.name}. Choose how to restore it.`);
    } catch {
      pending = null;
      say('That file is not valid JSON.', true);
    }
  }

  async function restore(mode: 'merge' | 'replace') {
    if (mode === 'replace' && !confirm('Replace all flights, camera keys and settings in this browser?')) return;
    try {
      const n = await restoreBackup(pending, mode);
      pending = null;
      say(`Restored ${n.flights} flights, ${n.manual} manual entries, ${n.cameraPaths} camera paths. Reload the page to apply restored settings.`);
      ondone();
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    }
  }
</script>

<section>
  <h2>Backup</h2>
  <p class="muted">Save everything this browser keeps (flights, camera keys, settings) to a file, or restore it.</p>
  <label class="check"><input type="checkbox" bind:checked={includeToken} /> Include Cesium ion token</label>
  {#if includeToken}<p class="muted">The file then contains your token. Do not share it.</p>{/if}
  <div class="row">
    <button onclick={exportBackup}>Export backup</button>
    <label class="file">
      <input type="file" accept=".json,application/json" onchange={pick} />
      <span>Import backup</span>
    </label>
  </div>
  {#if pending}
    <div class="row">
      <button onclick={() => restore('merge')}>Merge with this browser</button>
      <button onclick={() => restore('replace')}>Replace everything</button>
    </div>
  {/if}
  {#if message}<p class:error={failed} role="status">{message}</p>{/if}
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
    outline: 2px solid var(--needle);
    outline-offset: 2px;
  }
</style>
