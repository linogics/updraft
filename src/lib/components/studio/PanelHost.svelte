<script lang="ts" module>
  import type { PanelDef } from '#lib/studio/panels';

  // One import per panel for the whole session, so moving a panel to another dock does not load it twice.
  // Plain cache, nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const loads = new Map<string, ReturnType<PanelDef['load']>>();

  const key = (panel: PanelDef) => panel.key ?? panel.id;

  function load(panel: PanelDef) {
    let p = loads.get(key(panel));
    if (!p) {
      p = panel.load();
      loads.set(key(panel), p);
      // A failed import can be retried the next time the panel is shown.
      p.catch(() => loads.delete(key(panel)));
    }

    return p;
  }
</script>

<script lang="ts">
  import Spinner from '#lib/components/Spinner.svelte';
  import { m } from '#lib/paraglide/messages';
  import type { StudioState } from '#lib/state/studio.svelte';
  import type { PluginHostEnv } from '#lib/studio/pluginContext.svelte';

  import PanelError from './PanelError.svelte';

  let { panel, studio, host }: { panel: PanelDef; studio?: StudioState; host?: PluginHostEnv } = $props();

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
</script>

<svelte:boundary>
  {#await load(panel)}
    <Spinner label={m.panel_loading({ title: panel.title() })} />
  {:then mod}
    {@const Panel = mod.default}
    <Panel {studio} {host} {...mod.props} />
  {:catch e}
    <PanelError message={m.panel_failed({ title: panel.title(), message: message(e) })} />
  {/await}
  {#snippet failed(e)}
    <PanelError message={m.panel_failed({ title: panel.title(), message: message(e) })} />
  {/snippet}
</svelte:boundary>
