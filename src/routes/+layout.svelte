<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { navigating } from '$app/state';
  import { m } from '#lib/paraglide/messages';
  import { getLocale } from '#lib/paraglide/runtime';

  // The locale only changes on reload, so setting the lang attribute once is enough.
  onMount(() => (document.documentElement.lang = getLocale()));

  let { children } = $props();
</script>

{#if navigating.to}
  <div class="nav-bar" role="progressbar" aria-label={m.layout_loading_page()}></div>
{/if}

{@render children()}

<style>
  .nav-bar {
    position: fixed;
    inset: 0 0 auto;
    z-index: 1000;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--needle), transparent);
    background-size: 40% 100%;
    background-repeat: no-repeat;
    animation: sweep 1s linear infinite;
  }
  @keyframes sweep {
    from {
      background-position: -40% 0;
    }
    to {
      background-position: 140% 0;
    }
  }
</style>
