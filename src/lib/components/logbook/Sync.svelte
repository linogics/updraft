<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { getLocale } from '#lib/paraglide/runtime';
  import { setSyncKeys, syncKeysEnabled } from '#lib/sync';
  import { syncClient as client } from '#lib/sync/client.svelte';
  import { syncUrl } from '#lib/sync/config';
  import type { AuthMethod } from '#lib/sync/types';

  // Null means untouched, so the form follows the deploy preset until the user types.
  let urlDraft = $state<string | null>(null);
  let invalid = $state(false);
  let identity = $state('');
  let password = $state('');
  let signingUp = $state(false);
  let keys = $state(syncKeysEnabled());

  const url = $derived(urlDraft ?? client.preset?.url ?? '');
  const passwordMethod = $derived(client.methods?.some((x) => x.kind === 'password') ?? false);
  const redirects = $derived(
    client.methods?.filter((x): x is Extract<AuthMethod, { kind: 'redirect' }> => x.kind === 'redirect') ?? []
  );
  const status = $derived(client.engine?.status);

  const time = (t: number) => new Date(t).toLocaleTimeString(getLocale(), { timeStyle: 'short' });

  function statusText() {
    const e = client.engine;
    if (!e) return '';
    if (e.status === 'syncing') return m.sync_status_syncing();
    if (e.status === 'offline') return m.sync_status_offline();
    if (e.status === 'error') return m.sync_status_error({ error: e.lastError ?? '' });
    return e.lastSyncAt ? m.sync_status_idle({ time: time(e.lastSyncAt) }) : m.sync_status_never();
  }

  async function connect(e: SubmitEvent) {
    e.preventDefault();
    invalid = syncUrl(url) === null;
    if (invalid) return;

    await client.connect({ url });
  }

  // Called straight from the click, an OAuth popup needs the user gesture.
  function signInPassword(e: SubmitEvent) {
    e.preventDefault();
    void client.signIn({ kind: 'password' }, { identity, password });
    password = '';
  }

  function signUpPassword(e: SubmitEvent) {
    e.preventDefault();
    void client.signUp({ email: identity, password });
    password = '';
  }

  function toggleKeys() {
    setSyncKeys(keys);
  }
</script>

<div>
  {#if !client.ready}
    <p class="muted">{m.sync_connecting()}</p>
  {:else if !client.config}
    <p class="muted">{m.sync_intro()}</p>
    <form onsubmit={connect}>
      <label>
        {m.sync_server()}
        <input
          type="url"
          name="server"
          autocomplete="url"
          placeholder="https://sync.example.com"
          required
          spellcheck="false"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'sync-url-error' : undefined}
          value={url}
          oninput={(e) => (urlDraft = e.currentTarget.value)}
        />
      </label>
      {#if invalid}<p id="sync-url-error" class="error">{m.sync_invalid_server()}</p>{/if}
      <div class="row"><button type="submit">{m.sync_connect()}</button></div>
    </form>
  {:else}
    <p class="muted">
      {m.sync_server_in_use({ url: client.config.url })}
      {#if !client.session}
        <button type="button" class="link" onclick={() => client.disconnect()}>{m.sync_change_server()}</button>
      {/if}
    </p>

    {#if client.session}
      <p>{m.sync_signed_in_as({ user: client.session.user })}</p>
      <p class:error={status === 'error'} role="status" data-status={status}>{statusText()}</p>
      <div class="row">
        <button onclick={() => client.syncNow()} disabled={status === 'syncing'}>{m.sync_now()}</button>
      </div>
      <label class="check"><input type="checkbox" bind:checked={keys} onchange={toggleKeys} /> {m.sync_keys()}</label>
      {#if keys}<p class="muted">{m.sync_keys_warning()}</p>{/if}
      <p class="muted">{m.sync_settings_note()}</p>
      <div class="row">
        <button onclick={() => client.signOut()}>{m.sync_sign_out()}</button>
        <button onclick={() => client.disconnect()}>{m.sync_disconnect()}</button>
      </div>
    {:else if !client.methods}
      {#if !client.error}<p class="muted">{m.sync_asking_methods()}</p>{/if}
    {:else}
      {#if passwordMethod}
        {@const up = signingUp && client.canSignUp}
        <form onsubmit={up ? signUpPassword : signInPassword}>
          <label>
            {up ? m.sync_email() : m.sync_identity()}
            <input
              type={up ? 'email' : 'text'}
              name={up ? 'email' : 'identity'}
              autocomplete={up ? 'email' : 'username'}
              autocapitalize="none"
              spellcheck="false"
              required
              bind:value={identity}
            />
          </label>
          <label>
            {m.sync_password()}
            <input
              type="password"
              name="password"
              autocomplete={up ? 'new-password' : 'current-password'}
              minlength={up ? 8 : undefined}
              required
              bind:value={password}
            />
          </label>
          <div class="row">
            <button type="submit" disabled={client.busy}>{up ? m.sync_create_account() : m.sync_sign_in()}</button>
          </div>
        </form>
        {#if client.canSignUp}
          <button type="button" class="link" onclick={() => (signingUp = !signingUp)}>
            {up ? m.sync_have_account() : m.sync_create_account()}
          </button>
        {/if}
      {/if}
      {#if redirects.length}
        <div class="row">
          {#each redirects as r (r.id)}
            <button type="button" disabled={client.busy} onclick={() => client.signIn(r)}>
              {m.sync_sign_in_with({ label: r.label })}
            </button>
          {/each}
        </div>
      {/if}
      {#if !passwordMethod && !redirects.length}<p class="muted">{m.sync_no_methods()}</p>{/if}
    {/if}
  {/if}

  <div role="alert">
    {#if client.error}<p class="error">{client.error}</p>{/if}
  </div>
</div>

<style>
  .muted {
    color: var(--muted);
    margin: 4px 0;
  }
  form {
    display: grid;
    gap: 8px;
    max-width: 360px;
  }
  label {
    display: grid;
    gap: 2px;
  }
  label.check {
    display: flex;
    gap: 6px;
    align-items: center;
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
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--primary-hi);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
