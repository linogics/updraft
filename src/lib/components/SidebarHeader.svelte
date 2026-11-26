<script lang="ts">
  import type { Snippet } from 'svelte';

  import Logo from '#lib/components/Logo.svelte';

  let { title, actions }: { title?: string; actions?: Snippet } = $props();
</script>

<div class="header">
  <Logo />
  {#if title}<span class="title">{title}</span>{/if}
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 14px 16px;
    position: sticky;
    top: 0;
  }
  .actions {
    margin-inline-start: auto;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 13px;
  }
  .title::before {
    content: '/';
    margin-inline-end: 10px;
    color: var(--border-hi);
  }
</style>
