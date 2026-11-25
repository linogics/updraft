<script lang="ts">
  import { loadRuntimeConfig, saveIonToken } from '#lib/config';
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';

  // The dock passes the studio to every panel, the token form does not need it.
  // eslint-disable-next-line no-empty-pattern
  let {}: { studio: StudioState } = $props();

  let ionToken = $state('');
  let ionError = $state('');
  void loadRuntimeConfig().then((c) => (ionToken = c.cesiumIonToken));

  // The viewer reads the token once at start, so reload to apply it.
  function applyIonToken(e: SubmitEvent) {
    e.preventDefault();
    if (saveIonToken(ionToken.trim())) location.reload();
    else ionError = m.toolbar_ion_storage_blocked();
  }
</script>

<form class="ion" onsubmit={applyIonToken}>
  <label for="ion-token">{m.toolbar_ion_token()}</label>
  <input id="ion-token" type="password" autocomplete="off" bind:value={ionToken} placeholder="eyJhbGciOi…" />
  <p>
    <!-- Static i18n message with a fixed link, no user input. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html m.toolbar_ion_help({
      link: '<a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer">ion.cesium.com</a>'
    })}
  </p>
  {#if ionError}<p class="error" role="alert">{ionError}</p>{/if}
  <button type="submit">{m.toolbar_ion_save()}</button>
</form>

<style>
  .ion {
    display: grid;
    gap: 6px;
  }
  .ion p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .ion .error {
    color: var(--danger);
  }
  label {
    color: var(--muted);
  }
</style>
