<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { addPlugin } from '#lib/studio/pluginActions';

  let dialog: HTMLDialogElement;
  let url = $state('');
  let error = $state('');
  let busy = $state(false);

  /** Opens the dialog as a modal. The browser returns focus to the opener on close. */
  export function open() {
    url = '';
    error = '';
    dialog.showModal();
  }

  async function onsubmit(e: SubmitEvent) {
    // Cancel closes the dialog through its form method, nothing to check.
    if ((e.submitter as HTMLButtonElement | null)?.value === 'cancel') return;
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await addPlugin(url);
      dialog.close();
    } catch (err) {
      console.error('Could not add plugin', err);
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="add-plugin-title" closedby="any">
  <h1 id="add-plugin-title">{m.plugin_add_title()}</h1>

  <form method="dialog" {onsubmit}>
    <p class="warning" id="add-plugin-warning">{m.plugin_trust_warning()}</p>

    <label for="add-plugin-url">{m.plugin_url_label()}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="add-plugin-url"
      type="url"
      name="url"
      required
      autofocus
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      placeholder="https://example.com/plugin.js"
      aria-describedby="add-plugin-warning{error ? ' add-plugin-error' : ''}"
      aria-invalid={error ? 'true' : undefined}
      bind:value={url}
    />

    {#if error}
      <p class="error" id="add-plugin-error" role="alert">{error}</p>
    {/if}

    <div class="row">
      <button value="cancel" formnovalidate>{m.common_cancel()}</button>
      <button value="add" class="primary" disabled={busy}>{busy ? m.plugin_adding() : m.plugin_add_submit()}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 32px));
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
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  p {
    margin: 0;
  }
  .warning {
    padding: 8px 10px;
    border: 1px solid var(--warn, var(--border-hi));
    border-radius: 6px;
    background: var(--surface-2);
  }
  label {
    color: var(--muted);
    font-size: 12px;
  }
  input {
    font: inherit;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .error {
    color: var(--danger);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .primary {
    border-color: var(--primary);
    background: var(--primary-dim);
  }
</style>
