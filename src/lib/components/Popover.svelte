<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    icon,
    button = $bindable(),
    children
  }: { label: string; icon?: Snippet; button?: HTMLButtonElement; children: Snippet } = $props();

  const id = `popover-${Math.random().toString(36).slice(2, 9)}`;
  let panel: HTMLDivElement;

  // Native popover gives light dismiss and Escape; place it under its button when it opens.
  function place(e: ToggleEvent) {
    if (e.newState !== 'open') return;
    const r = button!.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - panel.offsetWidth - 8);
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.left = `${Math.max(8, left)}px`;
  }
</script>

<button
  bind:this={button}
  popovertarget={id}
  class="trigger"
  aria-label={icon ? label : undefined}
  title={icon ? label : undefined}
>
  {#if icon}{@render icon()}{:else}{label} ▾{/if}
</button>
<div bind:this={panel} {id} popover="auto" class="panel" ontoggle={place}>
  {@render children()}
</div>

<style>
  .trigger {
    font-size: 13px;
  }
  .panel {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 10px 12px;
    min-width: 220px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-size: 13px;
  }
</style>
