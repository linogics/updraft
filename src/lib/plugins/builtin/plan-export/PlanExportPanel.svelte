<script lang="ts">
  import { planExports, type PlannerExport } from '#lib/plan/exports';
  import type { PlanState } from '#lib/state/plan.svelte';

  let { plan }: { plan: PlanState } = $props();
  let error = $state('');

  async function download(e: PlannerExport) {
    error = '';
    let bytes: Uint8Array;
    try {
      bytes = await e.write({ points: plan.points, speed: plan.speed });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return;
    }

    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: e.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `updraft-route-${new Date().toISOString().slice(0, 10)}.${e.extension}`;
    a.click();
    // Revoking at once can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<div class="row">
  {#each planExports() as e (e.id)}
    <button onclick={() => download(e)} disabled={plan.points.length < 2}>{e.title()}</button>
  {/each}
</div>
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .error {
    color: var(--danger);
    margin: 0;
    font-size: 0.85rem;
  }
</style>
