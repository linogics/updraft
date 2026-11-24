<script lang="ts">
  import Logo from '#lib/components/Logo.svelte';

  let { title }: { title?: string } = $props();
</script>

<div class="header">
  <Logo />
  {#if title}<span class="title">{title}</span>{/if}
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
