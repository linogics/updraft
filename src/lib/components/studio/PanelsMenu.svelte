<script lang="ts">
  import PanelsTop from '@lucide/svelte/icons/panels-top-left';

  import { m } from '#lib/paraglide/messages';
  import { removePlugin } from '#lib/plugins/actions';
  import type { PluginEntry } from '#lib/plugins/entries';
  import { studioLayout } from '#lib/state/studioLayout.svelte';
  import { PLUGIN_PREFIX, pluginEntry, pluginPanelId, registry } from '#lib/studio/registry.svelte';
  import { flash, scrollToPanel, sortByName } from '#lib/ui/attention';

  import Popover from '../Popover.svelte';
  import AddPluginDialog from './AddPluginDialog.svelte';
  import { announce } from './panelActions.svelte';
  import PluginGrants from './PluginGrants.svelte';

  let addPlugin: AddPluginDialog;
  let trigger = $state<HTMLButtonElement>();

  async function onadded(e: PluginEntry) {
    flash(trigger);
    announce(m.plugin_added({ name: e.name }));
    // A planner only plugin has no studio panel.
    if (e.kind !== 'studio' || (e.hosts && !e.hosts.includes('studio'))) return;
    studioLayout.reveal(pluginPanelId(e.id));
    await scrollToPanel(pluginPanelId(e.id));
  }
</script>

<Popover label={m.panels_menu()} bind:button={trigger}>
  {#snippet icon()}<PanelsTop size={16} aria-hidden="true" />{/snippet}
  <ul>
    {#each sortByName(registry.list, (p) => p.title()) as p (p.id)}
      <li>
        <label>
          <!-- The switch attribute is Safari only for now, other browsers draw a checkbox. -->
          <input
            type="checkbox"
            {...{ switch: true }}
            checked={!studioLayout.value.hidden.includes(p.id)}
            onchange={(e) => (e.currentTarget.checked ? studioLayout.show(p.id) : studioLayout.hide(p.id))}
          />
          {p.title()}
        </label>
        {#if pluginEntry(p.id)}
          <button
            type="button"
            aria-label={m.plugin_uninstall_label({ name: p.title() })}
            onclick={() => removePlugin(p.id.slice(PLUGIN_PREFIX.length))}
          >
            {m.plugin_uninstall()}
          </button>
          <PluginGrants id={p.id.slice(PLUGIN_PREFIX.length)} />
        {/if}
      </li>
    {/each}
  </ul>
  <div class="actions">
    <button type="button" onclick={() => addPlugin.open()}>{m.plugin_add_menu()}</button>
    <button type="button" onclick={() => studioLayout.restoreDefaults()}>{m.panels_restore()}</button>
  </div>
</Popover>

<AddPluginDialog bind:this={addPlugin} {onadded} />

<style>
  ul {
    display: grid;
    gap: 8px;
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions {
    display: grid;
    gap: 6px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input[type='checkbox'] {
    accent-color: var(--primary);
    margin: 0;
    cursor: pointer;
  }
  input[type='checkbox']:focus-visible {
    outline: 3px solid var(--primary-hi);
    outline-offset: 3px;
  }
</style>
