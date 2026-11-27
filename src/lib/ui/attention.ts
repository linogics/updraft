import { tick } from 'svelte';

import { getLocale } from '#lib/paraglide/runtime';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rings an element in green for about two seconds. With reduced motion the ring stays steady and just disappears. */
export function flash(el?: Element | null) {
  const ring = '0 0 0 3px var(--ok), 0 0 14px 2px var(--ok)';
  const off = '0 0 0 3px transparent, 0 0 0 0 transparent';
  const frames = reduced()
    ? [{ boxShadow: ring }, { boxShadow: ring }]
    : [{ boxShadow: ring }, { boxShadow: ring, offset: 0.6 }, { boxShadow: off }];
  el?.animate(frames, { duration: 2000, easing: 'ease-out' });
}

/** Scrolls the element matching `selector` into view once the DOM has caught up with the state change. */
export async function scrollToSelector(selector: string) {
  await tick();
  document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
}

export const scrollToPanel = (id: string) => scrollToSelector(`[data-panel="${CSS.escape(id)}"]`);

/** Copy of the list ordered A to Z by the displayed name, in the current language. */
export function sortByName<T>(list: readonly T[], name: (item: T) => string): T[] {
  const collator = new Intl.Collator(getLocale());
  return [...list].sort((a, b) => collator.compare(name(a), name(b)));
}
