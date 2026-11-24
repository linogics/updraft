<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<progress class="spinner" aria-label={label}></progress>

<style>
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
