<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  let { compact = false }: { compact?: boolean } = $props();
</script>

<a href="/" class="logo" class:compact aria-label={m.logo_label()}>
  <img class="mark" src="/icon-192.png" alt="" />
  <span>updraft</span>
</a>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font: 700 18px/1 var(--display);
    letter-spacing: -0.01em;
  }
  .logo.compact {
    font-size: 16px;
    gap: 8px;
  }
  .mark {
    width: 28px;
    height: 28px;
  }
  .compact .mark {
    width: 24px;
    height: 24px;
  }
  .logo:focus-visible {
    outline: 2px solid var(--primary-hi);
    outline-offset: 3px;
    border-radius: 4px;
  }
</style>
