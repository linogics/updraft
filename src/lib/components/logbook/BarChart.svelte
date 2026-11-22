<script lang="ts">
  let { bars, label }: { bars: { label: string; hours: number }[]; label: string } = $props();
  const peak = $derived(Math.max(1, ...bars.map((b) => b.hours)));
  const step = $derived(120 / bars.length);
</script>

<figure>
  <svg viewBox="0 0 120 40" preserveAspectRatio="none" role="img" aria-label={label}>
    {#each bars as b, i (b.label)}
      {@const h = (b.hours / peak) * 36 + 1}
      <rect x={i * step + step * 0.12} width={step * 0.76} y={40 - h} height={h} class:now={i === bars.length - 1}>
        <title>{b.label}: {b.hours.toFixed(1)} h</title>
      </rect>
    {/each}
  </svg>
  <figcaption>{label}</figcaption>
</figure>

<style>
  figure {
    margin: 0;
    padding: 10px;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  svg {
    width: 100%;
    height: 72px;
    display: block;
  }
  rect {
    fill: #3a414c;
  }
  rect.now {
    fill: var(--needle);
  }
  figcaption {
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
