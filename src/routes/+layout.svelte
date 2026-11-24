<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { onNavigate } from '$app/navigation';
  import { navigating, updated } from '$app/state';
  import { m } from '#lib/paraglide/messages';
  import { getLocale } from '#lib/paraglide/runtime';

  // The locale only changes on reload, so setting the lang attribute once is enough.
  onMount(() => (document.documentElement.lang = getLocale()));

  // Plain cross-fade between pages. Browsers without view transitions and users who prefer reduced motion navigate as before.
  onNavigate((navigation) => {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
