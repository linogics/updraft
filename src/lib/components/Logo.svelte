<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  let { compact = false }: { compact?: boolean } = $props();
</script>

<a href="/" class="logo" class:compact aria-label={m.logo_label()}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 19c4 0 5-4 8-4s3 3 6 0 2-9 4-11" />
  </svg>
  <span>updraft</span>
</a>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    text-decoration: none;
    font: 600 20px/1 var(--display);
    letter-spacing: 0.01em;
  }
  .logo.compact {
    font-size: 17px;
  }
  svg {
    width: 1.1em;
    height: 1.1em;
    fill: none;
    stroke: var(--needle);
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .logo:focus-visible {
    outline: 2px solid var(--needle);
    outline-offset: 3px;
    border-radius: 4px;
  }
</style>
