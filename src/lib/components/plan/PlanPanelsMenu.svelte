<script lang="ts">
  import PanelsTop from '@lucide/svelte/icons/panels-top-left';

  import { m } from '#lib/paraglide/messages';
  import { planRegistry } from '#lib/plan/registry.svelte';
  import { removePlugin } from '#lib/plugins/actions';
  import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
  import { planLayout } from '#lib/state/planLayout.svelte';
  import { PLUGIN_PREFIX } from '#lib/studio/registry.svelte';

  import Popover from '../Popover.svelte';

  const planPlugins = $derived(pluginPrefs.list.filter((e) => e.kind === 'xc-planner'));

  function summary(e: (typeof planPlugins)[number]) {
    return [
      e.exports?.length ? m.plan_plugin_exports({ count: e.exports.length }) : '',
      e.leagues?.length ? m.plan_plugin_leagues({ count: e.leagues.length }) : ''
    ]
      .filter(Boolean)
      .join(', ');
  }

  /** The page owns the dialog, the header (and so this menu) is rendered twice. */
  let { onadd }: { onadd: () => void } = $props();
</script>

<Popover label={m.panels_menu()}>
  {#snippet icon()}<PanelsTop size={16} aria-hidden="true" />{/snippet}
  <ul>
    {#each planRegistry.user as p (p.id)}
      <li>
        <label>
          <!-- The switch attribute is Safari only for now, other browsers draw a checkbox. -->
          <input
            type="checkbox"
            {...{ switch: true }}
            checked={!planLayout.value.hidden.includes(p.id)}
            onchange={(e) => (e.currentTarget.checked ? planLayout.show(p.id) : planLayout.hide(p.id))}
          />
          {p.title()}
        </label>
        <button
          type="button"
          aria-label={m.plugin_uninstall_label({ name: p.title() })}
          onclick={() => removePlugin(p.id.slice(PLUGIN_PREFIX.length))}
        >
          {m.plugin_uninstall()}
        </button>
      </li>
    {/each}
  </ul>
  {#if planPlugins.length}
    <ul aria-label={m.plan_plugins_heading()}>
      {#each planPlugins as e (e.id)}
        <li>
          <span>{e.name} <small>{summary(e)}</small></span>
          <button
            type="button"
            aria-label={m.plugin_uninstall_label({ name: e.name })}
            onclick={() => removePlugin(e.id)}
          >
            {m.plugin_uninstall()}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="actions">
    <button type="button" onclick={onadd}>{m.plugin_add_menu()}</button>
  </div>
</Popover>

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
    gap: 8px;
  }
  .actions {
    display: grid;
    gap: 6px;
  }
  small {
    color: var(--muted);
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
