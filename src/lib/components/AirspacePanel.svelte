<script lang="ts">
  import type { StudioState } from '#lib/state/studio.svelte';
  import AirspaceControls from './AirspaceControls.svelte';

  // The dock passes the studio to every panel, the airspace controls do not need it.
  // eslint-disable-next-line no-empty-pattern
  let {}: { studio: StudioState } = $props();
</script>

<AirspaceControls />
