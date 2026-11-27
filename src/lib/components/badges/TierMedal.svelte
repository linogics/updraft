<script lang="ts">
  import Medal from '@lucide/svelte/icons/medal';

  import type { Tier } from '#lib/badges/progress';

  // A null tier is the locked look. The tier colours are tokens in app.css.
  let { tier, size = 18, ...rest }: { tier: Tier | null; size?: number; [key: string]: unknown } = $props();
</script>

<Medal {size} style="color: var(--tier-{tier ?? 'none'})" {...rest} />
