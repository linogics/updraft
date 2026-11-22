<script lang="ts">
  import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
</script>

<span class="switch" role="group" aria-label="Altitude reference">
  <button aria-pressed={altRefPrefs.ref === 'msl'} onclick={() => altRefPrefs.set('msl')}>MSL</button>
  <button aria-pressed={altRefPrefs.ref === 'agl'} onclick={() => altRefPrefs.set('agl')}>AGL</button>
</span>

<style>
  .switch {
    display: inline-flex;
    margin-left: 6px;
    font-weight: 400;
  }
  button {
    padding: 0 6px;
    font-size: 11px;
    color: var(--muted);
  }
  button:first-child {
    border-radius: 4px 0 0 4px;
  }
  button:last-child {
    border-radius: 0 4px 4px 0;
    margin-left: -1px;
  }
  button[aria-pressed='true'] {
    color: var(--text);
    background: var(--surface-2);
  }
</style>
