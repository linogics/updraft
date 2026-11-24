<script lang="ts">
  let { message }: { message: string } = $props();
</script>

<p class="error" role="alert">{message}</p>

<style>
  .error {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--danger);
    border-radius: 6px;
    color: var(--danger);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
</style>
