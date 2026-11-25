<script lang="ts">
  import type { StudioState } from '#lib/state/studio.svelte';
  import ThermalOverlayControls from './ThermalOverlayControls.svelte';

  // The dock passes the studio to every panel, the thermal overlay controls do not need it.
  // eslint-disable-next-line no-empty-pattern
  let {}: { studio: StudioState } = $props();
</script>

<ThermalOverlayControls />
