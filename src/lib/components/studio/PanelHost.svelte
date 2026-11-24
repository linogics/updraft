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
  import type { StudioState } from '#lib/state/studio.svelte';

  let { panel, studio }: { panel: PanelDef; studio: StudioState } = $props();

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
</script>

<svelte:boundary>
  {#await load(panel)}
    <progress class="spinner" aria-label={m.panel_loading({ title: panel.title() })}></progress>
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
  /* Indeterminate <progress> drawn as a ring: a conic arc over a track, rotating. */
  progress.spinner:indeterminate {
    --size: 28px;
    --thickness: 3px;
    --duration: 1.2s;
    display: block;
    width: var(--size);
    height: var(--size);
    margin: 12px auto;
    appearance: none;
    border-radius: 50%;
    background: conic-gradient(from 90deg, var(--primary) 158deg, transparent 0) var(--border);
    animation: spin var(--duration) linear infinite;
  }
  progress.spinner:indeterminate::-webkit-progress-bar,
  progress.spinner:indeterminate::-webkit-progress-value,
  progress.spinner:indeterminate::-moz-progress-bar {
    display: none;
    background: none;
  }
  @supports (background-clip: border-area) {
    progress.spinner:indeterminate {
      border: var(--thickness) solid transparent;
      background-clip: border-area;
      background-origin: border-box;
    }
  }
  /* Without border-area the whole disc is filled, so punch the centre out. */
  @supports not (background-clip: border-area) {
    progress.spinner:indeterminate {
      mask: radial-gradient(
        farthest-side,
        transparent calc(100% - var(--thickness)),
        #000 calc(100% - var(--thickness))
      );
    }
  }
  @media (forced-colors: active) {
    progress.spinner:indeterminate {
      forced-color-adjust: none;
      background: conic-gradient(from 90deg, CanvasText 158deg, transparent 0) Canvas;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    progress.spinner:indeterminate {
      --duration: 6s;
    }
  }
  @keyframes spin {
    to {
      rotate: 1turn;
    }
  }
</style>
