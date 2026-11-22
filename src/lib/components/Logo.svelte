<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  let { compact = false }: { compact?: boolean } = $props();
</script>

<a href="/" class="logo" class:compact aria-label={m.logo_label()}>
  <span class="mark">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 19c4 0 5-4 8-4s3 3 6 0 2-9 4-11" />
    </svg>
  </span>
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
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--primary);
  }
  .compact .mark {
    width: 24px;
    height: 24px;
    border-radius: 6px;
  }
  svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke: #fff;
    stroke-width: 2.6;
    stroke-linecap: round;
  }
  .logo:focus-visible {
    outline: 2px solid var(--primary-hi);
    outline-offset: 3px;
    border-radius: 4px;
  }
</style>
