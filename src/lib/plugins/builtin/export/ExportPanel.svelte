<script lang="ts">
  import type { StudioState } from '#lib/state/studio.svelte';

  import ExportImage from './ExportImage.svelte';
  import ExportVideo from './ExportVideo.svelte';

  let { studio }: { studio: StudioState } = $props();
</script>

<ExportImage {studio} />
<ExportVideo {studio} />
