<script lang="ts">
  import '../app.css';

  import { onDestroy, onMount } from 'svelte';
  import { beforeNavigate, onNavigate } from '$app/navigation';
  import { navigating, updated } from '$app/state';

  import { provideCoreServices } from '#lib/data';
  import { m } from '#lib/paraglide/messages';
  import { getLocale } from '#lib/paraglide/runtime';
  import { startServicePlugins } from '#lib/plugins/startup';
  import { syncClient } from '#lib/sync/client.svelte';

  // Before the children mount, so every page can use the services. The app is client only, nothing runs on a server.
  onDestroy(provideCoreServices());

  // The locale only changes on reload, so setting the lang attribute once is enough.
  onMount(() => {
    document.documentElement.lang = getLocale();
    void startServicePlugins();
    void syncClient.init();
  });

  // After a new deploy, the next page change loads the new version instead of the old code in memory.
  beforeNavigate(({ willUnload, to }) => {
    if (updated.current && !willUnload && to?.url) location.href = to.url.href;
  });

  // Plain cross-fade between pages. Browsers without view transitions and users who prefer reduced motion navigate as before.
  // Query updates within a page (like the studio's scene URL) are not page changes and must not block input.
  onNavigate((navigation) => {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (navigation.from?.route.id === navigation.to?.route.id) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  let { children } = $props();
</script>

{#if navigating.to}
  <div class="nav-bar" role="progressbar" aria-label={m.layout_loading_page()}></div>
{/if}

{@render children()}

<div role="status">
  {#if updated.current}
    <div class="update">
      <span>{m.update_available()}</span>
      <button onclick={() => location.reload()}>{m.update_reload()}</button>
    </div>
  {/if}
</div>

<style>
  .nav-bar {
    position: fixed;
    inset: 0 0 auto;
    z-index: 1000;
    width: 40%;
    height: 3px;
    background: var(--primary);
    animation: sweep 1s linear infinite;
  }
  .update {
    position: fixed;
    left: 50%;
    bottom: 16px;
    z-index: 1000;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100vw - 32px);
    padding: 8px 8px 8px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.4);
  }
  @keyframes sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }
</style>
