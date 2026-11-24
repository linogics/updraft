<script lang="ts" module>
  import type { PanelDef } from '#lib/studio/panels';

  // One import per panel for the whole session, so moving a panel to another dock does not load it twice.
  // Plain cache, nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const loads = new Map<string, ReturnType<PanelDef['load']>>();

  function load(panel: PanelDef) {
    let p = loads.get(panel.id);
    if (!p) {
      p = panel.load();
      loads.set(panel.id, p);
      // A failed import can be retried the next time the panel is shown.
      p.catch(() => loads.delete(panel.id));
    }

    return p;
  }
</script>

<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import Spinner from '#lib/components/Spinner.svelte';
  import type { StudioState } from '#lib/state/studio.svelte';

  let { panel, studio }: { panel: PanelDef; studio: StudioState } = $props();

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
</script>

<svelte:boundary>
  {#await load(panel)}
    <Spinner label={m.panel_loading({ title: panel.title() })} />
  {:then mod}
    {@const Panel = mod.default}
    <Panel {studio} />
  {:catch e}
    <p class="error" role="alert">{m.panel_failed({ title: panel.title(), message: message(e) })}</p>
  {/await}
  {#snippet failed(e)}
    <p class="error" role="alert">{m.panel_failed({ title: panel.title(), message: message(e) })}</p>
  {/snippet}
</svelte:boundary>

<style>
  .error {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--danger);
    border-radius: 6px;
    color: var(--danger);
    font-size: 12px;
  }
</style>
