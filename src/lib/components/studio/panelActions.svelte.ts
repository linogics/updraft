import { tick } from 'svelte';
import type { PageLayout } from '#lib/state/pageLayout.svelte';
import { m } from '#lib/paraglide/messages';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import { DOCK_LABELS, type Dock } from '#lib/studio/panels';
import { panelById } from '#lib/studio/registry.svelte';

/** Text of the one polite live region the studio page renders. */
export const panelStatus = $state({ text: '' });

// Clear first and set a moment later, so an identical message and a refocused control are announced again.
export function announce(text: string) {
  panelStatus.text = '';
  setTimeout(() => (panelStatus.text = text), 60);
}

export const panelMenuId = (id: string) => `panel-menu-${id}`;

/** Runs a layout change, animated when the browser can and motion is allowed, and keeps focus on the panel's actions button. */
async function moveAnimated(id: string, change: () => void) {
  const apply = async () => {
    change();
    await tick();
    document.getElementById(panelMenuId(id))?.focus({ preventScroll: true });
  };

  const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches && 'startViewTransition' in document;
  if (animate) await document.startViewTransition(apply).updateCallbackDone;
  else await apply();
}

/** Moves a panel of a page layout and announces where it went. */
export async function movePagePanel(
  layout: PageLayout,
  id: string,
  column: string,
  index: number,
  title: string,
  columnLabel: string
) {
  await moveAnimated(id, () => layout.move(id, column, index));
  announce(m.panel_moved({ title, dock: columnLabel, position: layout.value.columns[column].indexOf(id) + 1 }));
}

/** Moves a studio panel to a dock. */
export async function movePanel(id: string, dock: Dock, index: number) {
  const title = panelById(id)?.title() ?? id;
  await moveAnimated(id, () => studioLayout.move(id, dock, index));
  const position = studioLayout.value.docks[dock].indexOf(id) + 1;
  announce(m.panel_moved({ title, dock: DOCK_LABELS[dock](), position }));
}

/** Removes a panel from its dock. Its actions button disappears, so focus moves to a neighbour in the same dock. */
export async function removePanel(id: string) {
  const ids = Object.values(studioLayout.value.docks).find((d) => d.includes(id)) ?? [];
  const i = ids.indexOf(id);
  const neighbour = ids[i + 1] ?? ids[i - 1];
  studioLayout.hide(id);
  announce(m.panel_removed({ title: panelById(id)?.title() ?? id }));
  await tick();
  if (neighbour) document.getElementById(panelMenuId(neighbour))?.focus({ preventScroll: true });
}
