<script lang="ts">
  /** Full-screen staged loader. `step` is the index of the running step in `steps`. */
  let { steps, step }: { steps: string[]; step: number } = $props();

  const pct = $derived(Math.round((Math.min(step, steps.length) / steps.length) * 100));
</script>

<div class="screen">
  <div class="box">
    <div
      class="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={steps[step]}
    >
      <span style:width="{Math.max(pct, 4)}%"></span>
    </div>
    <ol>
      {#each steps as s, i (s)}
        <li class:done={i < step} class:now={i === step}>{s}</li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .screen {
    display: grid;
    place-items: center;
    height: 100vh;
    height: 100dvh;
    padding: 16px;
  }
  .box {
    width: min(360px, 100%);
    display: grid;
    gap: 14px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease-out;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--muted);
  }
  li::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 8px;
    border-radius: 50%;
    border: 1px solid currentColor;
    vertical-align: middle;
  }
  li.done::before {
    background: currentColor;
  }
  li.now {
    color: var(--text);
  }
  li.now::before {
    border-color: var(--primary);
    background: var(--primary);
  }
</style>
