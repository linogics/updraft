<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import type { PlanState } from '#lib/state/plan.svelte';
  import { unitPrefs } from '#lib/state/units.svelte';
  import { xcPrefs } from '#lib/state/xcPrefs.svelte';
  import { formatDistance } from '#lib/ui/units';
  import { XC_TYPE_LABELS } from '#lib/xc/labels';
  import { leagues } from '#lib/xc/leagues';

  let { plan }: { plan: PlanState } = $props();
</script>

<label class="switch">
  <input
    type="checkbox"
    {...{ switch: true }}
    checked={xcPrefs.enabled}
    onchange={(e) => xcPrefs.setEnabled(e.currentTarget.checked)}
  />
  {m.xc_enabled()}
</label>
<fieldset class="feature" disabled={!xcPrefs.enabled}>
  <label>
    {m.plan_league()}
    <select value={xcPrefs.league} onchange={(e) => xcPrefs.set(e.currentTarget.value)}>
      {#each leagues() as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
    </select>
  </label>
  <!-- The page clears the score and does not score while XC is off. -->
  {#if xcPrefs.enabled && plan.scoring}
    <p class="muted">{m.xc_scoring()}</p>
  {:else if plan.score}
    <p>
      <strong>{m.plan_points({ points: Math.round(plan.score.points) })}</strong>
      <span class="muted">
        {XC_TYPE_LABELS[plan.score.type]()}, {formatDistance(plan.score.distance, unitPrefs.units)} x {plan.score
          .multiplier}
      </span>
    </p>
  {:else}
    <p class="muted">–</p>
  {/if}
</fieldset>

<style>
  label:not(.switch) {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  .muted {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
