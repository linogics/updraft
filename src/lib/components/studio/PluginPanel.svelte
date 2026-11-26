<script lang="ts">
  import { onMount } from 'svelte';

  import { m } from '#lib/paraglide/messages';
  import { services } from '#lib/plugins/services';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { mountedPlugins } from '#lib/studio/exportHooks.svelte';
  import { createPluginContext, type PluginHostEnv, studioHost } from '#lib/studio/pluginContext.svelte';
  import type { StudioPlugin } from '#lib/studio/plugins';

  import PanelError from './PanelError.svelte';

  /**
   * Hosts one plugin. The plugin draws into `el`, the error box shows what went wrong without touching other panels.
   * The studio passes `studio`, the planner passes `host`.
   */
  let { studio, host, plugin }: { studio?: StudioState; host?: PluginHostEnv; plugin: StudioPlugin } = $props();

  let el: HTMLDivElement;
  let error = $state('');

  const fail = (what: string, err: unknown) => {
    console.error(`Plugin "${plugin.id}": ${what}`, err);
    error = m.plugin_failed({ name: plugin.name, message: err instanceof Error ? err.message : String(err) });
  };

  onMount(() => {
    const missing = services.missing(plugin.requires);
    if (missing.length) {
      error = m.plugin_missing_services({ name: plugin.name, services: missing.join(', ') });
      return;
    }

    mountedPlugins.add(plugin);
    const { ctx, dispose } = createPluginContext(host ?? studioHost(studio!), plugin.id, plugin.requires ?? [], (err) =>
      fail('an event handler failed', err)
    );
    let destroy: void | (() => void);
    try {
      destroy = plugin.mount(el, ctx);
    } catch (err) {
      fail('mount failed', err);
    }

    return () => {
      mountedPlugins.delete(plugin);
      try {
        if (typeof destroy === 'function') destroy();
      } catch (err) {
        console.error(`Plugin "${plugin.id}": destroy failed`, err);
      }

      dispose();
    };
  });
</script>

{#if error}<PanelError message={error} />{/if}
<div bind:this={el} class="host"></div>

<style>
  .host {
    min-width: 0;
    height: 100%;
  }
</style>
