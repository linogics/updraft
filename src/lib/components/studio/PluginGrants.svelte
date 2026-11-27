<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { writeServices } from '#lib/plugins/grants';
  import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';

  /** The write permissions of one installed plugin, saved as soon as they change. */
  let { id }: { id: string } = $props();

  const entry = $derived(pluginPrefs.list.find((e) => e.id === id));
  const writes = $derived(writeServices(entry?.requires));
</script>

{#if entry && writes.length}
  <fieldset>
    <legend class="sr-only">{m.plugin_grants_label({ name: entry.name })}</legend>
    {#each writes as w (w.name)}
      <label>
        <input
          type="checkbox"
          checked={entry.grants?.includes(w.name)}
          onchange={(e) => pluginPrefs.setGrant(id, w.name, e.currentTarget.checked)}
        />
        {m.plugin_consent_item({ service: w.name, methods: w.methods.join(', ') })}
      </label>
    {/each}
  </fieldset>
{/if}

<style>
  fieldset {
    flex-basis: 100%;
    display: grid;
    gap: 4px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 12px;
    color: var(--muted);
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input {
    accent-color: var(--primary);
    margin: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
