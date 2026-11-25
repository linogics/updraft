<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
  import { createPluginContext } from '#lib/studio/pluginContext.svelte';
  import { mountedPlugins } from '#lib/studio/exportHooks.svelte';
  import type { Plugin } from '#lib/studio/plugins';
  import PanelError from './PanelError.svelte';

  /** Hosts one plugin. The plugin draws into `el`, the error box shows what went wrong without touching other panels. */
  let { studio, plugin }: { studio: StudioState; plugin: Plugin } = $props();

  let el: HTMLDivElement;
  let error = $state('');

  const fail = (what: string, err: unknown) => {
    console.error(`Plugin "${plugin.id}": ${what}`, err);
    error = m.plugin_failed({ name: plugin.name, message: err instanceof Error ? err.message : String(err) });
  };

  onMount(() => {
    mountedPlugins.add(plugin);
    const { ctx, dispose } = createPluginContext(studio, (err) => fail('a subscriber failed', err));
    let destroy: unknown;
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
