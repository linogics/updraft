import { tick } from 'svelte';
import { m } from '#lib/paraglide/messages';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import { DOCK_LABELS, panelById, type Dock } from '#lib/studio/panels';

/** Text of the one polite live region the studio page renders. */
export const panelStatus = $state({ text: '' });

// Clear first and set a moment later, so an identical message and a refocused control are announced again.
export function announce(text: string) {
  panelStatus.text = '';
  setTimeout(() => (panelStatus.text = text), 60);
}

export const panelMenuId = (id: string) => `panel-menu-${id}`;

/** Moves a panel, animated when the browser can and motion is allowed, and keeps focus on its actions button. */
export async function movePanel(id: string, dock: Dock, index: number) {
  const title = panelById(id)?.title() ?? id;
  const apply = async () => {
    studioLayout.move(id, dock, index);
    await tick();
    document.getElementById(panelMenuId(id))?.focus({ preventScroll: true });
  };
  const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches && 'startViewTransition' in document;
  if (animate) await document.startViewTransition(apply).updateCallbackDone;
  else await apply();
  const position = studioLayout.value.docks[dock].indexOf(id) + 1;
  announce(m.panel_moved({ title, dock: DOCK_LABELS[dock](), position }));
}

/** Hides a panel. Its actions button disappears, so focus moves to a neighbour in the same dock. */
export async function hidePanel(id: string) {
  const ids = Object.values(studioLayout.value.docks).find((d) => d.includes(id)) ?? [];
  const i = ids.indexOf(id);
  const neighbour = ids[i + 1] ?? ids[i - 1];
  studioLayout.hide(id);
  announce(m.panel_hidden({ title: panelById(id)?.title() ?? id }));
  await tick();
  if (neighbour) document.getElementById(panelMenuId(neighbour))?.focus({ preventScroll: true });
}
