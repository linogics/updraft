import { untrack } from 'svelte';
import type { NeedKind, StudioState } from '#lib/state/studio.svelte';

/** Keeps a kind of studio work alive while `active()` is true. Released on unmount. Call during component init. */
export function useNeed(studio: () => StudioState, kind: NeedKind, active: () => boolean = () => true) {
  $effect(() => {
    if (!active()) return;
    // need() reads and writes studio state: keep that out of this effect's dependencies.
    return untrack(() => studio().need(kind));
  });
}
